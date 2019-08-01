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
    addressWeb,
    buttonForCommand,
    HandlerContext,
    HandlerResult,
    ParameterType,
} from "@atomist/automation-client";
import {
    actionableButton,
    CommandHandlerRegistration,
    CommandListenerInvocation,
    slackFooter,
    slackInfoMessage,
    slackTs,
} from "@atomist/sdm";
import {
    Action,
    Attachment,
    bold,
    codeLine,
    SlackMessage,
} from "@atomist/slack-messages";
import {
    fromName,
    toName,
} from "../adhoc/preferences";
import {
    ApplyAllFingerprintsName,
    ApplyTargetFingerprintName,
} from "../handlers/commands/applyFingerprint";
import { UpdateTargetFingerprintName } from "../handlers/commands/updateTarget";
import {
    Aspect,
    Vote,
} from "../machine/Aspect";
import { aspectOf } from "../machine/Aspects";
import {
    applyFingerprintTitle,
    GitCoordinate,
    prBody,
} from "../support/messages";
import { orDefault } from "../support/util";

export interface MessageMakerParams {
    ctx: HandlerContext;
    voteResults: { failed: boolean, failedVotes: Vote[] };
    msgId: string;
    channel: string;
    coord: GitCoordinate;
    aspects: Aspect[];
}

export type MessageMaker = (params: MessageMakerParams) => Promise<HandlerResult>;

/**
 * Message for one case where a Fingerprint target is different from what's in the latest Push.
 * Offer two choices:  'apply' or 'change target'
 *
 * @param params
 * @param vote
 */
function oneFingerprint(params: MessageMakerParams, vote: Vote): Attachment {
    return slackInfoMessage(
        orDefault(() => vote.summary.title, "New Target"),
        orDefault(() => vote.summary.description, vote.text), {
            actions: [
                buttonForCommand(
                    { text: "Apply" },
                    ApplyTargetFingerprintName,
                    {
                        msgId: params.msgId,
                        targetfingerprint: toName(vote.fpTarget.type, vote.fpTarget.name),
                        title: applyFingerprintTitle(vote.fpTarget, params.aspects),
                        branch: vote.diff.branch,
                        body: prBody(vote, params.aspects),
                        targets: {
                            owner: vote.diff.owner,
                            repo: vote.diff.repo,
                            branch: vote.diff.branch,
                        },
                    }),
                buttonForCommand(
                    { text: "Set New Target" },
                    UpdateTargetFingerprintName,
                    {
                        msgId: params.msgId,
                        targetfingerprint: toName(vote.fpTarget.type, vote.fpTarget.name),
                        sha: vote.fingerprint.sha,
                    },
                ),
            ],
        }).attachments[0];
}

interface IgnoreParameters extends ParameterType {
    msgId: string;
    fingerprints: string;
}

export const IgnoreCommandName = "IgnoreFingerprintDiff";

export function ignoreCommand(aspects: Aspect[]): CommandHandlerRegistration<IgnoreParameters> {
    return {
        name: IgnoreCommandName,
        parameters: { msgId: { required: false }, fingerprints: { required: false } },
        listener: async (i: CommandListenerInvocation<IgnoreParameters>) => {

            const fingerprints = i.parameters.fingerprints.split(",").map(f => {
                const { type, name } = fromName(f);
                const aspect = aspectOf({ type }, aspects);
                if (!!aspect && !!aspect.toDisplayableFingerprintName) {
                    return aspect.toDisplayableFingerprintName(name);
                }
                return name;
            });

            const msg = slackInfoMessage(
                "New Fingerprint Target",
                `Dismissed fingerprint target updates for ${fingerprints.map(codeLine).join(", ")}`,
            );

            // collapse the message
            await i.addressChannels(
                msg,
                { id: i.parameters.msgId },
            );
        },
    };
}

function ignoreButton(params: MessageMakerParams): Action {
    return actionableButton<IgnoreParameters>(
        { text: "Dismiss" },
        IgnoreCommandName,
        {
            msgId: params.msgId,
            fingerprints: params.voteResults.failedVotes
                .map(vote => `${vote.fpTarget.type}::${vote.fpTarget.name}`).join(","),
        },
    );
}

/**
 */
function applyAll(params: MessageMakerParams): Attachment {

    const fingerprints = params.voteResults.failedVotes.map(vote => {
        const aspect = aspectOf({ type: vote.fpTarget.type }, params.aspects);
        if (!!aspect && !!aspect.toDisplayableFingerprintName) {
            return aspect.toDisplayableFingerprintName(vote.fpTarget.name);
        }
        return vote.fpTarget.name;
    });

    return {
        title: "Apply all Changes",
        text: `Apply all changes from ${params.voteResults.failedVotes.map(vote => codeLine(vote.name)).join(", ")}`,
        color: "#D7B958",
        fallback: "Fingerprint Update",
        mrkdwn_in: ["text"],
        actions: [
            buttonForCommand(
                { text: "Apply All" },
                ApplyAllFingerprintsName,
                {
                    msgId: params.msgId,
                    fingerprints: params.voteResults.failedVotes.map(vote => toName(vote.fpTarget.type, vote.fpTarget.name)).join(","),
                    title: `Apply all of ${fingerprints.join(", ")}`,
                    body: params.voteResults.failedVotes.map(v => prBody(v, params.aspects)).join("\n"),
                    targets: {
                        owner: params.coord.owner,
                        repo: params.coord.repo,
                        branch: params.coord.branch,
                    },
                } as any,
            ),
            ignoreButton(params),
        ],
    };
}

/**
 * Default Message Maker for target fingerprint impact handler
 *
 * @param params
 */
export const messageMaker: MessageMaker = async params => {

    const message: SlackMessage = {
        attachments: [
            {
                text: `Fingerprint differences detected on ${bold(`${params.coord.owner}/${params.coord.repo}/${params.coord.branch}`)}`,
                fallback: "Fingerprint diffs",
            },
            ...params.voteResults.failedVotes.map(vote => oneFingerprint(params, vote)),
        ],
    };

    if (params.voteResults.failedVotes.length > 1) {
        message.attachments.push(applyAll(params));
    } else {
        const lastAttachment = message.attachments[message.attachments.length - 1];
        lastAttachment.actions = [
            ...(lastAttachment.actions || []),
            ignoreButton(params),
        ];
    }

    message.attachments[message.attachments.length - 1].footer = slackFooter();
    message.attachments[message.attachments.length - 1].ts = slackTs();

    if (!!params.channel) {
        return params.ctx.messageClient.send(
            message,
            await addressSlackChannelsFromContext(params.ctx, params.channel),
            // {id: params.msgId} if you want to update messages if the target goal has not changed
            { id: params.msgId },
        );
    } else {
        return params.ctx.messageClient.send(
            message,
            addressWeb(),
            // {id: params.msgId} if you want to update messages if the target goal has not changed
            { id: params.msgId },
        );
    }

};
