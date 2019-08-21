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
    checkFingerprintTargets,
    commaSeparatedList,
    voteResults,
} from "@atomist/clj-editors";
import {
    findSdmGoalOnCommit,
    Goal,
    SdmGoalState,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import {
    Aspect,
    Diff,
    FP,
    Vote,
} from "../machine/Aspect";
import {
    FingerprintImpactHandlerConfig,
    FingerprintOptions,
} from "../machine/fingerprintSupport";
import {
    getDiffSummary,
    GitCoordinate,
    updateableMessage,
} from "../support/messages";
import { GetFpTargets } from "../typings/types";

/**
 * create callback to be used when fingerprint and target are out of sync
 */
function fingerprintOutOfSyncCallback(
    ctx: HandlerContext,
    diff: Diff,
    aspect: Aspect,
): (s: string, fpTarget: FP, fingerprint: FP) => Promise<Vote> {

    return async (text, fpTarget, fingerprint) => {
        return {
            name: fingerprint.name,
            decision: "Against",
            abstain: false,
            diff,
            fingerprint,
            fpTarget,
            text,
            summary: getDiffSummary(diff, fpTarget, aspect),
        };
    };
}

/**
 * Create callback to be used when fingerprint and target is in sync
 */
function fingerprintInSyncCallback(ctx: HandlerContext, diff: Diff): (fingerprint: FP) => Promise<Vote> {
    return async fingerprint => {
        return {
            abstain: false,
            name: fingerprint.name,
            decision: "For",
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
 * apply all choices.
 *
 * only take this action if one of the diff handlers voted Against
 * skip this if we don't know what channel to use
 * make the message id unique by the current fingerprint sha, the target sha, the git coordinate and the channel
 *
 * @param config
 */
export function votes(config: FingerprintOptions & FingerprintImpactHandlerConfig):
    (ctx: HandlerContext, votes: Vote[], coord: GitCoordinate, channel: string) => Promise<any> {

    return async (ctx, vs: Vote[], coord, channel) => {

        const result = voteResults<Vote>(vs);

        let goalState;
        if (result.failed) {

            await config.messageMaker({
                ctx,
                msgId: updateableMessage(
                    [].concat(
                        result.failedVotes.map(vote => vote.fingerprint.sha),
                        result.failedVotes.map(vote => vote.fpTarget.sha)),
                    coord),
                channel,
                voteResults: result,
                coord,
                aspects: toArray(config.aspects || []),
            });

            goalState = {
                state: SdmGoalState.failure,
                description: `compliance check for ${commaSeparatedList(result.failedVotes.map(vote => vote.fingerprint.name))} has failed`,
            };

        } else {

            goalState = {
                state: SdmGoalState.success,
                description: `compliance check for ${votes.length} fingerprints has passed`,
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
 */
export async function checkFingerprintTarget(
    ctx: HandlerContext,
    diff: Diff,
    aspect: Aspect,
    targetsQuery: () => Promise<GetFpTargets.Query>): Promise<any> {

    return checkFingerprintTargets(
        targetsQuery,
        fingerprintOutOfSyncCallback(ctx, diff, aspect),
        fingerprintInSyncCallback(ctx, diff),
        diff,
    );
}
