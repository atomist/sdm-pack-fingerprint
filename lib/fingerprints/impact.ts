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
    GitHubRepoRef,
    HandlerContext,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import {
    actionableButton,
    findSdmGoalOnCommit,
    Goal,
    SdmGoalState,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as fingerprints from "../../fingerprints/index";
import { queryPreferences } from "../adhoc/preferences";
import { footer } from "../support/util";
import { ApplyTargetFingerprint } from "./applyFingerprint";
import { UpdateTargetFingerprint } from "./updateTarget";

// when we discover a backpack dependency that is not the target state
// then we ask the user whether they want to update to the new target version
// or maybe they want this backpack version to become the new target version
function callback(ctx: HandlerContext, diff: fingerprints.Diff, goal?: Goal):
    (s: string, fingerprint: fingerprints.FP) => Promise<any> {
    return async (text, fingerprint) => {
        const msgId = fingerprints.consistentHash([fingerprint.sha, diff.channel, diff.owner, diff.repo]);
        const message: SlackMessage = {
            attachments: [
                {
                    text,
                    color: "#45B254",
                    fallback: "Fingerprint Update",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            { text: "Update project" },
                            ApplyTargetFingerprint,
                            {
                                msgId,
                                owner: diff.owner,
                                repo: diff.repo,
                                fingerprint: fingerprint.name,
                            }),
                        actionableButton(
                            { text: "Set New Target" },
                            UpdateTargetFingerprint,
                            {
                                msgId,
                                name: fingerprint.name,
                                sha: fingerprint.sha,
                            },
                        ),
                    ],
                    footer: footer(),
                },
            ],
        };
        if (goal) {
            try {
                logger.info(`compliance goal ${goal.name} has failed`);
                await editGoal(
                    ctx, diff, goal,
                    {
                        state: SdmGoalState.failure,
                        description: `compliance check for ${diff.to.name} has failed`,
                    },
                );
            } catch (error) {
                logger.error(error);
            }
        } else {
            logger.info("running without a compliance goal");
        }
        return ctx.messageClient.addressChannels(message, diff.channel, { id: msgId });
    };
}

async function editGoal(ctx: HandlerContext, diff: fingerprints.Diff, goal: Goal, params: UpdateSdmGoalParams): Promise<any> {
    const id = new GitHubRepoRef(diff.owner, diff.repo, diff.sha);
    const complianceGoal = await findSdmGoalOnCommit(ctx, id, diff.providerId, goal);
    return updateGoal(ctx, complianceGoal, params);
}

function fingerprintInSyncCallback(ctx: HandlerContext, diff: fingerprints.Diff, goal?: Goal):
    (fingerprint: fingerprints.FP) => Promise<any> {
    return async fingerprint => {
        if (goal) {
            await editGoal(
                ctx, diff, goal,
                {
                    state: SdmGoalState.success,
                    description: `compliance check for ${diff.to.name} has passed`,
                },
            );
        }
        return SuccessPromise;
    };
}

export async function checkFingerprintTargets(ctx: HandlerContext, diff: fingerprints.Diff, goal?: Goal): Promise<any> {
    return fingerprints.checkFingerprintGoals(
        queryPreferences(ctx.graphClient),
        callback(ctx, diff, goal),
        fingerprintInSyncCallback(ctx, diff, goal),
        diff,
    );
}
