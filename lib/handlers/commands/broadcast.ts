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
    ParameterType,
} from "@atomist/automation-client";
import {
    actionableButton,
    CommandHandlerRegistration,
    CommandListenerInvocation,
    slackFooter,
} from "@atomist/sdm";
import {
    codeLine,
    italic,
    SlackMessage,
    user,
} from "@atomist/slack-messages";
import _ = require("lodash");
import { broadcastFingerprint } from "../../../fingerprints";
import { queryFingerprints } from "../../adhoc/fingerprints";
import {
    ApplyTargetFingerprintName, BroadcastFingerprintMandateName,
} from "./applyFingerprint";

export function askAboutBroadcast(cli: CommandListenerInvocation,
                                  name: string,
                                  version: string,
                                  sha: string): Promise<void> {
    const author = cli.context.source.slack.user.id;
    const msgId: string = _.times(20, () => _.random(35).toString(36)).join("");
    return cli.addressChannels(
        {
            attachments:
                [{
                    author_name: "Broadcast Fingerprint Target",
                    author_icon: `https://images.atomist.com/rug/warning-yellow.png`,
                    text: `Shall we nudge everyone with a PR for the new ${codeLine(`${name}`)} target?`,
                    fallback: `Boardcast PR for ${name}:${sha}`,
                    color: "#ffcc00",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            {
                                text: "Broadcast Nudge",
                            },
                            BroadcastFingerprintNudge,
                            { name, version, author, sha, msgId },
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
                                fingerprint: name,
                                msgId,
                            },
                        ),
                    ],
                    footer: slackFooter(),
                }],
        },
        { id: msgId },
    );
}

// ------------------------------
// broadcast nudge
// ------------------------------

export interface BroadcastFingerprintNudgeParameters extends ParameterType {
    name: string;
    version: string;
    sha: string;
    reason: string;
    author: string;
}

function broadcastNudge(cli: CommandListenerInvocation<BroadcastFingerprintNudgeParameters>): Promise<any> {
    const msgId = `broadcastNudge-${cli.parameters.name}-${cli.parameters.sha}`;
    return broadcastFingerprint(
        queryFingerprints(cli.context.graphClient),
        {
            name: cli.parameters.name,
            version: cli.parameters.version,
            sha: cli.parameters.sha,
        },
        (owner: string, repo: string, channel: string) => {
            const message: SlackMessage = {
                attachments: [
                    {
                        author_name: "Library Update",
                        author_icon: `https://images.atomist.com/rug/warning-yellow.png`,
                        text: `${user(cli.parameters.author)} has updated the target version of \`${cli.parameters.name}\`.

The reason provided is:

${italic(cli.parameters.reason)}`,
                        fallback: "Fingerprint Update",
                        mrkdwn_in: ["text"],
                        color: "#ffcc00",
                    },
                    {
                        text: `Shall we update project to use the new \`${cli.parameters.name}\` target?`,
                        fallback: "none",
                        actions: [
                            buttonForCommand(
                                {
                                    text: "Update project",
                                },
                                ApplyTargetFingerprintName,
                                {
                                    msgId,
                                    fingerprint: cli.parameters.name,
                                    title: `Updated target for ${cli.parameters.name} to ${cli.parameters.version}`,
                                    body: cli.parameters.reason,
                                },
                            ),
                        ],
                        color: "#ffcc00",
                        footer: slackFooter(),
                        callback_id: "atm-confirm-done",
                    },
                ],
            };
            return cli.context.messageClient.addressChannels(message, channel, { id: msgId });
        },
    );
}

export const BroadcastFingerprintNudge: CommandHandlerRegistration<BroadcastFingerprintNudgeParameters> = {
    name: "BroadcastFingerprintNudge",
    description: "message all Channels linked to Repos that contain a particular fingerprint",
    parameters: {
        name: { required: true },
        version: { required: true },
        sha: {
            required: true,
            description: "sha of fingerprint to broadcast",
        },
        reason: {
            required: true,
            control: "textarea",
            description: "always give a reason why we're releasing the nudge",
        },
        author: {
            required: true,
            description: "author of the Nudge",
        },
    },
    listener: broadcastNudge,
    autoSubmit: true,
};
