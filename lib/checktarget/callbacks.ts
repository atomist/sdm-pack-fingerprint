/*
 * Copyright © 2019 Atomist, Inc.
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
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import {
    findSdmGoalOnCommit,
    Goal,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import { SdmGoalState } from "@atomist/sdm-core/lib/typings/types";
import {
    checkFingerprintTargets,
    commaSeparatedList,
    Diff,
    FP,
    renderData,
    Vote,
    voteResults,
    VoteResults,
} from "../../fingerprints/index";
import { getFPTargets } from "../adhoc/preferences";
import {
    FingerprintImpactHandlerConfig,
    FingerprintRegistration,
} from "../machine/fingerprintSupport";
import {
    getDiffSummary,
    GitCoordinate,
    updateableMessage,
} from "./messageMaker";

/**
 * create callback to be used when fingerprint and target are out of sync
 */
function fingerprintOutOfSyncCallback(
    ctx: HandlerContext,
    diff: Diff,
    config: FingerprintImpactHandlerConfig,
    registrations: FingerprintRegistration[],
): (s: string, fpTarget: FP, fingerprint: FP) => Promise<Vote> {

    return async (text, fpTarget, fingerprint) => {
        return {
            name: fingerprint.name,
            decision: "Against",
            abstain: false,
            ballot: diff,
            diff,
            fingerprint,
            fpTarget,
            text,
            summary: getDiffSummary(diff, fpTarget, registrations),
        };
    };
}

/**
 * create callback to be used when fingerprint and target is in sync
 *
 * @param ctx
 * @param diff
 * @param goal
 */
function fingerprintInSyncCallback(ctx: HandlerContext, diff: Diff, goal?: Goal):
    (fingerprint: FP) => Promise<Vote> {
    return async fingerprint => {
        return {
            abstain: false,
            name: fingerprint.name,
            decision: "For",
            ballot: diff,
        };
    };
}

/**
 * just trying to capture how we update Goals
 *
 * @param ctx
 * @param diff
 * @param goal
 * @param params
 */
async function editGoal(ctx: HandlerContext, diff: GitCoordinate, goal: Goal, params: UpdateSdmGoalParams): Promise<any> {
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

/**
 * for target fingerprints, wait until we've seen all of Votes so we can expose both apply and
 * apply all choices
 *
 * @param config
 */
export function votes(config: FingerprintImpactHandlerConfig):
    (ctx: HandlerContext, votes: Vote[], coord: GitCoordinate, channel: string) => Promise<any> {

    return async (ctx, vs, coord, channel) => {

        const result: VoteResults = voteResults(vs);

        let goalState;
        logger.debug(`ballot result ${renderData(result)} for ${renderData(vs)} and ${coord}`);

        if (result.failed) {

            await config.messageMaker({
                ctx,
                msgId: updateableMessage(result.failedVotes[0].fingerprint, coord, channel),
                channel,
                voteResults: result,
                coord,
            });

            goalState = {
                state: SdmGoalState.failure,
                description: `compliance check for ${commaSeparatedList(result.failedFps)} has failed`,
            };
        } else {

            goalState = {
                state: SdmGoalState.success,
                description: `compliance check for ${result.successFps.length} fingerprints has passed`,
            };
        }

        if (config.complianceGoal) {

            return editGoal(
                ctx,
                coord,
                config.complianceGoal,
                goalState,
            );
        }

        return SuccessPromise;
    };
}

/**
 * check whether the fingerprint in this diff is the same as the target value
 *
 * @param ctx
 * @param diff
 * @param config
 * @param registrations
 */
export async function checkFingerprintTarget(
    ctx: HandlerContext,
    diff: Diff,
    config: FingerprintImpactHandlerConfig,
    registrations: FingerprintRegistration[]): Promise<any> {

    return checkFingerprintTargets(
        () => {
            return getFPTargets(ctx.graphClient);
        },
        fingerprintOutOfSyncCallback(ctx, diff, config, registrations),
        fingerprintInSyncCallback(ctx, diff, config.complianceGoal),
        diff,
    );
}
