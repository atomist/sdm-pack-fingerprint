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
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {
    actionableButton,
    CodeTransformRegistration,
    CommandHandlerRegistration,
    slackFooter,
} from "@atomist/sdm";
import {
    Attachment,
    bold,
    SlackMessage,
} from "@atomist/slack-messages";
import { FingerprintRegistration } from "../..";
import {
    consistentHash,
    Diff,
    FP,
    Vote,
    VoteResults,
} from "../../fingerprints";
import { UpdateTargetFingerprintParameters } from "../handlers/commands/updateTarget";
import { DiffSummary } from "../machine/fingerprintSupport";

export interface MessageMakerParams {
    ctx: HandlerContext;
    voteResults: VoteResults;
    msgId: string;
    channel: string;
    coord: GitCoordinate;
    editProject: CodeTransformRegistration<any>;
    editAllProjects: CodeTransformRegistration<any>;
    mutateTarget: CommandHandlerRegistration<UpdateTargetFingerprintParameters>;
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
    return consistentHash([fingerprint.sha, channel, coordinate.owner, coordinate.repo]);
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
export function oneFingerprint(params: MessageMakerParams, vote: Vote): Attachment {
    return {
        title: orDefault(() => vote.summary.title, "New Target"),
        text: orDefault(() => vote.summary.description, vote.text),
        color: "warning",
        fallback: "Fingerprint Update",
        mrkdwn_in: ["text"],
        actions: [
            actionableButton<any>(
                { text: "Apply" },
                params.editProject,
                {
                    msgId: params.msgId,
                    fingerprint: vote.fpTarget.name,
                    title: `Apply ${vote.fpTarget.name}`,
                    body: prBody(vote),
                    targets: {
                        owner: vote.diff.owner,
                        repo: vote.diff.repo,
                        branch: vote.diff.branch,
                    },
                } as any),
            actionableButton<any>(
                { text: "Set New Target" },
                params.mutateTarget,
                {
                    msgId: params.msgId,
                    name: vote.fingerprint.name,
                    sha: vote.fingerprint.sha,
                },
            ),
        ],
    };
}

/**
 *
 * @param params
 */
export function applyAll(params: MessageMakerParams): Attachment {
    return {
        title: "Apply all Changes",
        text: `Apply all changes from ${params.voteResults.failedVotes.map(vote => vote.name).join(", ")}`,
        color: "warning",
        fallback: "Fingerprint Update",
        mrkdwn_in: ["text"],
        actions: [
            actionableButton<any>(
                { text: "Apply All" },
                params.editAllProjects,
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
    }

    message.attachments[message.attachments.length - 1].footer = slackFooter();

    return params.ctx.messageClient.send(
        message,
        await addressSlackChannelsFromContext(params.ctx, params.channel),
        // {id: params.msgId} if you want to update messages if the target goal has not changed
        { id: undefined },
    );
};
