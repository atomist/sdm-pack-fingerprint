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
    buttonForCommand,
    HandlerContext,
    HandlerResult,
    logger,
    ParameterType,
} from "@atomist/automation-client";
import {
    actionableButton,
    CommandHandlerRegistration,
    CommandListenerInvocation,
    slackFooter,
} from "@atomist/sdm";
import {
    Action,
    Attachment,
    bold,
    SlackMessage,
} from "@atomist/slack-messages";
import _ = require("lodash");
import { FingerprintRegistration } from "../..";
import {
    Diff,
    FP,
    Vote,
    VoteResults,
} from "../../fingerprints";
import { ApplyAllFingerprintsName, ApplyTargetFingerprintName } from "../handlers/commands/applyFingerprint";
import { UpdateTargetFingerprintName } from "../handlers/commands/updateTarget";
import { DiffSummary } from "../machine/fingerprintSupport";

export interface MessageMakerParams {
    ctx: HandlerContext;
    voteResults: VoteResults;
    msgId: string;
    channel: string;
    coord: GitCoordinate;
}

export interface GitCoordinate {
    owner: string;
    repo: string;
    sha: string;
    providerId: string;
    branch?: string;
}

export type MessageMaker = (params: MessageMakerParams) => Promise<HandlerResult>;

type MessageIdMaker = (fingerprint: FP, coordinate: GitCoordinate, channel: string) => string;

export const updateableMessage: MessageIdMaker = (fingerprint, coordinate: GitCoordinate, channel: string) => {
    // return consistentHash([fingerprint.sha, channel, coordinate.owner, coordinate.repo]);
    return _.times(20, () => _.random(35).toString(36)).join("");
};

/**
 * get a diff summary if any registrations support one for this Fingerprint type
 */
export function getDiffSummary(diff: Diff, target: FP, registrations: FingerprintRegistration[]): undefined | DiffSummary {

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

function prBody(vote: Vote): string {
    const title: string =
        orDefault(
            () => vote.summary.title,
            `apply fingerprint ${vote.fpTarget.name}`);
    const description: string =
        orDefault(
            () => vote.summary.description,
            `no summary`);

    return `#### ${title}\n${description}`;
}

/**
 * Message for one case where a Fingerprint target is different from what's in the latest Push.
 * Offer two choices:  'apply' or 'change target'
 *
 * @param params
 * @param vote
 */
function oneFingerprint(params: MessageMakerParams, vote: Vote): Attachment {
    return {
        title: orDefault(() => vote.summary.title, "New Target"),
        text: orDefault(() => vote.summary.description, vote.text),
        color: "warning",
        fallback: "Fingerprint Update",
        mrkdwn_in: ["text"],
        actions: [
            buttonForCommand(
                { text: "Apply" },
                ApplyTargetFingerprintName,
                {
                    msgId: params.msgId,
                    fingerprint: vote.fpTarget.name,
                    title: `Apply ${vote.fpTarget.name}`,
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
                    name: vote.fingerprint.name,
                    sha: vote.fingerprint.sha,
                },
            ),
        ],
    };
}

interface IgnoreParameters extends ParameterType { msgId: string; fingerprints: string; }

export const IgnoreCommandRegistration: CommandHandlerRegistration<IgnoreParameters> = {
    name: "IgnoreFingerprintDiff",
    parameters: { msgId: { required: false }, fingerprints: { required: false } },
    listener: async (i: CommandListenerInvocation<IgnoreParameters>) => {
        // TODO - this is an opportunity to provide feedback that the project does not intend to merge this
        // collapse the message
        await i.addressChannels(
            {
                attachments: [
                    {
                        title: "Fingerprints Ignored",
                        fallback: "Fingerprints Ignored",
                        text: `Ignoring ${i.parameters.fingerprints}`,
                    },
                ],
            },
            { id: i.parameters.msgId },
        );
    },
};

function ignoreButton(params: MessageMakerParams): Action {
    return actionableButton<IgnoreParameters>(
        { text: "Ignore" },
        IgnoreCommandRegistration,
        {
            msgId: params.msgId,
            fingerprints: params.voteResults.failedVotes.map(vote => vote.fpTarget.name).join(","),
        },
    );
}

/**
 *
 * @param params
 */
function applyAll(params: MessageMakerParams): Attachment {
    return {
        title: "Apply all Changes",
        text: `Apply all changes from ${params.voteResults.failedVotes.map(vote => vote.name).join(", ")}`,
        color: "warning",
        fallback: "Fingerprint Update",
        mrkdwn_in: ["text"],
        actions: [
            buttonForCommand(
                { text: "Apply All" },
                ApplyAllFingerprintsName,
                {
                    msgId: params.msgId,
                    fingerprints: params.voteResults.failedVotes.map(vote => vote.fpTarget.name).join(","),
                    title: `Apply all of \`${params.voteResults.failedVotes.map(vote => vote.fpTarget.name).join(", ")}\``,
                    body: params.voteResults.failedVotes.map(prBody).join("\n"),
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
        message.attachments.push(
            {
                text: "Ignore this change",
                fallback: "Ignore this change",
                actions: [
                    ignoreButton(params),
                ],
            },
        );
    }

    message.attachments[message.attachments.length - 1].footer = slackFooter();

    return params.ctx.messageClient.send(
        message,
        await addressSlackChannelsFromContext(params.ctx, params.channel),
        // {id: params.msgId} if you want to update messages if the target goal has not changed
        { id: params.msgId },
    );
};
