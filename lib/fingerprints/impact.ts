/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    FailurePromise,
    GitHubRepoRef,
    HandlerContext,
    HandlerResult,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    findSdmGoalOnCommit,
    Goal,
    RepoTargetingParameters,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import { SdmGoalState } from "@atomist/sdm-core/lib/typings/types";
import {
    checkFingerprintTargets,
    commaSeparatedList,
    consistentHash,
    Diff,
    FP,
    renderData,
    Vote,
    voteResults,
    VoteResults,
} from "../../fingerprints/index";
import { queryPreferences } from "../adhoc/preferences";
import {
    FingerprintApplicationCommandRegistration,
} from "../handlers/commands/applyFingerprint";
import {
    UpdateTargetFingerprint,
    UpdateTargetFingerprintParameters,
} from "../handlers/commands/updateTarget";
import {
    DiffSummary,
    FingerprintImpactHandlerConfig,
    FingerprintRegistration,
} from "../machine/FingerprintSupport";

export interface MessageMakerParams {
    ctx: HandlerContext;
    title: string;
    text: string;
    fingerprint: FP;
    fpTarget: FP;
    diff: Diff;
    msgId: string;
    editProject: CommandHandlerRegistration<RepoTargetingParameters>;
    mutateTarget: CommandHandlerRegistration<UpdateTargetFingerprintParameters>;
}

export type MessageMaker = (params: MessageMakerParams) => Promise<HandlerResult>;

type MessageIdMaker = (fingerprint: FP, diff: Diff) => string;

const updateableMessage: MessageIdMaker = (fingerprint, diff) => {
    return consistentHash([fingerprint.sha, diff.channel, diff.owner, diff.repo]);
};

function getDiffSummary(diff: Diff, target: FP, registrations: FingerprintRegistration[]): undefined | DiffSummary {

    try {
       for (const registration of registrations) {
            if (registration.summary && registration.selector(diff.to)) {
                return registration.summary(diff, target);
            }
        }
    } catch (e) {
        logger.warn(`failed to create summary: ${e}`);
    }

    return undefined;
}

function orDefault<T>(cb: () => T, x: T): T {
    try {
        return cb();
    } catch (y) {
        return x;
    }
}

// when we discover a backpack dependency that is not the target state
// then we ask the user whether they want to update to the new target version
// or maybe they want this backpack version to become the new target version
function callback(ctx: HandlerContext, diff: Diff, config: FingerprintImpactHandlerConfig, registrations: FingerprintRegistration[]):
    (s: string, fpTarget: FP, fingerprint: FP) => Promise<Vote> {
    return async (text, fpTarget, fingerprint) => {

        const summary = getDiffSummary(diff, fpTarget, registrations);

        await config.messageMaker({
            ctx,
            msgId: updateableMessage(fingerprint, diff),
            title: orDefault( () => summary.title , "New Target"),
            text: orDefault( () => summary.description, text),
            fpTarget,
            fingerprint,
            diff,
            editProject: FingerprintApplicationCommandRegistration,
            mutateTarget: UpdateTargetFingerprint});

        if (config.complianceGoal) {
            return {
                name: fingerprint.name,
                decision: "Against",
                abstain: false,
                ballot: diff,
            };
        } else {
            return {
                abstain: true,
            };
        }
    };
}

async function editGoal(ctx: HandlerContext, diff: Diff, goal: Goal, params: UpdateSdmGoalParams): Promise<any> {
    logger.info(`edit goal ${goal.name} to be in state ${params.state} for ${diff.owner}, ${diff.repo}, ${diff.sha}, ${diff.providerId}`);
    try {
        const id = new GitHubRepoRef(diff.owner, diff.repo, diff.sha);
        const complianceGoal = await findSdmGoalOnCommit(ctx, id, diff.providerId, goal);
        logger.info(`found compliance goal in phase ${complianceGoal.phase}`);
        if (!(complianceGoal.phase === SdmGoalState.failure)) {
            return updateGoal(ctx, complianceGoal, params);
        } else {
            return SuccessPromise;
        }
    } catch (error) {
        logger.error(`Error: ${error}`);
        return FailurePromise;
    }
}

function fingerprintInSyncCallback(ctx: HandlerContext, diff: Diff, goal?: Goal):
    (fingerprint: FP) => Promise<Vote> {
    return async fingerprint => {
        if (goal) {
            return {
                abstain: false,
                name: fingerprint.name,
                decision: "For",
                ballot: diff,
            };
        } else {
            return {
                abstain: true,
            };
        }
    };
}

export function votes(config: FingerprintImpactHandlerConfig): (ctx: HandlerContext, votes: Vote[]) => Promise<any> {
    return async (ctx, vs) => {
        if (config.complianceGoal) {

            let goalState;
            const result: VoteResults = voteResults(vs);
            logger.debug(`ballot result ${renderData(result)} for ${renderData(vs)}`);

            if (result.failed) {
                goalState = {
                    state: SdmGoalState.failure,
                    description: `compliance check for ${commaSeparatedList(result.failedFps)} has failed`,
                };
            } else {
                goalState = {
                    state: SdmGoalState.success,
                    description: `compliance check for ${commaSeparatedList(result.successFps)} has passed`,
                };
            }

            if (result.diff) {
                return editGoal(
                    ctx,
                    result.diff,
                    config.complianceGoal,
                    goalState,
                );
            } else {
                return undefined;
            }
        }
        return SuccessPromise;
    };
}

export async function checkFingerprintTarget(
    ctx: HandlerContext,
    diff: Diff,
    config: FingerprintImpactHandlerConfig,
    registrations: FingerprintRegistration[]): Promise<any> {

    return checkFingerprintTargets(
        queryPreferences(ctx.graphClient),
        callback(ctx, diff, config, registrations),
        fingerprintInSyncCallback(ctx, diff, config.complianceGoal),
        diff,
    );
}
