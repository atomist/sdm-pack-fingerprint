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
    CodeTransformRegistration,
    CommandHandlerRegistration,
    findSdmGoalOnCommit,
    Goal,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import { SdmGoalState } from "@atomist/sdm-core/lib/typings/types";
import * as fingerprints from "../../fingerprints/index";
import {
    Diff,
    FP,
    Vote,
} from "../../fingerprints/index";
import { queryPreferences } from "../adhoc/preferences";
import { FingerprintHandlerConfig } from "../machine/FingerprintSupport";
import {
    ApplyTargetFingerprint,
    ApplyTargetFingerprintParameters,
} from "./applyFingerprint";
import {
    UpdateTargetFingerprint,
    UpdateTargetFingerprintParameters,
} from "./updateTarget";

export interface MessageMakerParams {
    ctx: HandlerContext;
    text: string;
    fingerprint: fingerprints.FP;
    diff: fingerprints.Diff;
    msgId: string;
    editProject: CodeTransformRegistration<ApplyTargetFingerprintParameters>;
    mutateTarget: CommandHandlerRegistration<UpdateTargetFingerprintParameters>;
}

export type MessageMaker = (params: MessageMakerParams) => Promise<HandlerResult>;

type MessageIdMaker = (fingerprint: FP, diff: Diff) => string;

const updateableMessage: MessageIdMaker = (fingerprint, diff) => {
    return fingerprints.consistentHash([fingerprint.sha, diff.channel, diff.owner, diff.repo]);
};

// when we discover a backpack dependency that is not the target state
// then we ask the user whether they want to update to the new target version
// or maybe they want this backpack version to become the new target version
function callback(ctx: HandlerContext, diff: fingerprints.Diff, config: FingerprintHandlerConfig):
    (s: string, fingerprint: fingerprints.FP) => Promise<fingerprints.Vote> {
    return async (text, fingerprint) => {

        await config.messageMaker({
            ctx,
            msgId: updateableMessage(fingerprint, diff),
            text,
            fingerprint,
            diff,
            editProject: ApplyTargetFingerprint,
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

async function editGoal(ctx: HandlerContext, diff: fingerprints.Diff, goal: Goal, params: UpdateSdmGoalParams): Promise<any> {
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

function fingerprintInSyncCallback(ctx: HandlerContext, diff: fingerprints.Diff, goal?: Goal):
    (fingerprint: fingerprints.FP) => Promise<fingerprints.Vote> {
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

export function votes(config: FingerprintHandlerConfig): (ctx: HandlerContext, votes: Vote[]) => Promise<any> {
    return async (ctx, vs) => {
        if (config.complianceGoal) {

            let goalState;
            const result: fingerprints.VoteResults = fingerprints.voteResults(vs);

            if (result.failed) {
                goalState = {
                    state: SdmGoalState.failure,
                    description: `compliance check for ${fingerprints.commaSeparatedList(result.failedFps)} has failed`,
                };
            } else {
                goalState = {
                    state: SdmGoalState.success,
                    description: `compliance check for ${fingerprints.commaSeparatedList(result.successFps)} has passed`,
                };
            }

            await editGoal(
                ctx,
                result.diff,
                config.complianceGoal,
                goalState,
            );
        }
        return SuccessPromise;
    };
}

export async function checkFingerprintTargets(ctx: HandlerContext, diff: fingerprints.Diff, config: FingerprintHandlerConfig): Promise<any> {
    return fingerprints.checkFingerprintTargets(
        queryPreferences(ctx.graphClient),
        callback(ctx, diff, config),
        fingerprintInSyncCallback(ctx, diff, config.complianceGoal),
        diff,
    );
}
