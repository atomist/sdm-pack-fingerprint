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
    addressSlackChannelsFromContext,
    FailurePromise,
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
    PushImpactListenerInvocation,
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

async function editGoal(pli: PushImpactListenerInvocation, goal: Goal, params: UpdateSdmGoalParams): Promise<any> {
    try {
        const { id, push: { repo: { org: { provider: { providerId } } } } } = pli;
        const complianceGoal = await findSdmGoalOnCommit(pli.context, id, providerId, goal);
        logger.info(`found compliance goal in phase ${complianceGoal.phase}`);
        if (!(complianceGoal.phase === SdmGoalState.failure)) {
            return updateGoal(pli.context, complianceGoal, params);
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
    (pli: PushImpactListenerInvocation, votes: Vote[], channel: string) => Promise<any> {

    return async (pli: PushImpactListenerInvocation, vs: Vote[], channel) => {

        const result = voteResults<Vote>(vs);

        let goalState;
        if (result.failed) {

            if (!!channel) {
                // clean up old message
                await pli.context.messageClient.delete(
                    await addressSlackChannelsFromContext(pli.context, channel),
                    { id: updateableMessage(pli.configuration.name, pli.push.repo.owner, pli.push.repo.name, pli.push.branch, pli.push.before.sha) });
            }

            await config.messageMaker({
                pli,
                msgId: updateableMessage(pli.configuration.name, pli.push.repo.owner, pli.push.repo.name, pli.push.branch, pli.push.after.sha),
                channel,
                voteResults: result,
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
                pli,
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
