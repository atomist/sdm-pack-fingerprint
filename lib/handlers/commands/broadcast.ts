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
    buttonForCommand,
    logger,
    ParameterType,
} from "@atomist/automation-client";
import {
    broadcastFingerprint,
    FP,
} from "@atomist/clj-editors";
import {
    actionableButton,
    CommandHandlerRegistration,
    CommandListenerInvocation,
    slackQuestionMessage,
    slackWarningMessage,
} from "@atomist/sdm";
import {
    codeLine,
    italic,
    user,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import { findTaggedRepos } from "../../adhoc/fingerprints";
import {
    fromName,
    toName,
} from "../../adhoc/preferences";
import {
    applyToFeature,
    displayName,
} from "../../machine/Features";
import { FindLinkedReposWithFingerprint } from "../../typings/types";
import {
    ApplyTargetFingerprintName,
    BroadcastFingerprintMandateName,
} from "./applyFingerprint";

export function askAboutBroadcast(
    cli: CommandListenerInvocation,
    fp: FP,
    msgId: string): Promise<void> {

    const author = cli.context.source.slack.user.id;

    const message = slackQuestionMessage(
        "Broadcast Fingerprint Target",
        `Shall we send every affected repository a nudge or pull request for the new  ${codeLine(toName(fp.type, fp.name))} target?`,
        {
            actions: [
                actionableButton(
                    {
                        text: "Broadcast Nudge",
                    },
                    BroadcastFingerprintNudge,
                    {
                        author,
                        msgId,
                        sha: fp.sha,
                        fingerprint: toName(fp.type, fp.name),
                    },
                ),
                buttonForCommand(
                    {
                        text: "Broadcast PRs",
                    },
                    BroadcastFingerprintMandateName,
                    {
                        body: "broadcast PR everywhere",
                        title: "Broadcasting PRs",
                        branch: "master",
                        fingerprint: toName(fp.type, fp.name),
                        msgId,
                    },
                ),
            ],
        },
    );

    // always create a new message
    return cli.addressChannels(message, { id: msgId });
}

// ------------------------------
// broadcast nudge
// ------------------------------

export interface BroadcastFingerprintNudgeParameters extends ParameterType {
    fingerprint: string;
    sha: string;
    reason: string;
    author: string;
    msgId?: string;
}

function targetUpdateMessage(cli: CommandListenerInvocation<BroadcastFingerprintNudgeParameters>, type: string, name: string): string {

    const displayableName: string = applyToFeature({ type, name, data: {}, sha: "" }, displayName);

    return `${user(cli.parameters.author)} has updated the target version of ${codeLine(displayableName)}.

    The reason provided is:

    ${italic(cli.parameters.reason)}`;
}

/**
 * send messages to all channels with Repos that might be impacted by this target change
 *
 * @param cli
 */
function broadcastNudge(cli: CommandListenerInvocation<BroadcastFingerprintNudgeParameters>): Promise<any> {

    const msgId = `broadcastNudge-${cli.parameters.name}-${cli.parameters.sha}`;

    return broadcastFingerprint(
        async (type: string, name: string): Promise<FindLinkedReposWithFingerprint.Repo[]> => {
            // TODO this in memory filtering should be moved into the query
            const data: FindLinkedReposWithFingerprint.Query = await (findTaggedRepos(cli.context.graphClient))(type, name);
            logger.info(
                `findTaggedRepos(broadcastNudge)
                    ${JSON.stringify(
                    data.Repo
                        .filter(repo => _.get(repo, "branches[0].commit.analysis"))
                        .filter(repo => repo.branches[0].commit.analysis.some(x => x.name === name && x.type === type)))}`);
            return data.Repo
                .filter(repo => _.get(repo, "branches[0].commit.analysis"))
                .filter(repo => repo.branches[0].commit.analysis.some(x => x.name === name && x.type === type));
        },
        {
            ...fromName(cli.parameters.fingerprint),
            sha: cli.parameters.sha,
        },
        (owner: string, repo: string, channel: string) => {
            const { type, name } = fromName(cli.parameters.fingerprint);
            const message = slackWarningMessage("Fingerprint Target", targetUpdateMessage(cli, type, name), cli.context);

            message.attachments.push({
                text: `Shall we update repository to use the new ${codeLine(name)} target?`,
                fallback: `Shall we update repository to use the new ${codeLine(name)} target?`,
                actions: [
                    buttonForCommand(
                        {
                            text: "Update",
                        },
                        ApplyTargetFingerprintName,
                        {
                            msgId,
                            targetfingerprint: cli.parameters.fingerprint,
                            title: `Updated target for ${name}`,
                            body: cli.parameters.reason,
                        },
                    ),
                ],
                callback_id: "atm-confirm-done",
            });

            // each channel with a repo containing this fingerprint gets a message
            // use the msgId passed in so all the msgIds across the different channels are the same
            return cli.context.messageClient.addressChannels(message, channel, { id: msgId });
        },
    );
}

export const BroadcastFingerprintNudge: CommandHandlerRegistration<BroadcastFingerprintNudgeParameters> = {
    name: "BroadcastFingerprintNudge",
    description: "message all Channels linked to Repos that contain a particular fingerprint",
    parameters: {
        fingerprint: { required: true },
        sha: {
            required: true,
            description: "sha of fingerprint to broadcast",
        },
        reason: {
            required: true,
            control: "textarea",
            pattern: /[\s\S]*/,
            description: "always give a reason why we're releasing the nudge",
        },
        author: {
            required: true,
            description: "author of the Nudge",
        },
        msgId: {
            required: false,
            displayable: false,
        },
    },
    listener: broadcastNudge,
    autoSubmit: true,
};
