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
    actionableButton,
    CommandHandlerRegistration,
    CommandListenerInvocation,
} from "@atomist/sdm";
import {
    bold,
    codeLine,
    italic,
    SlackMessage,
    user,
} from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import { queryFingerprints } from "../../adhoc/fingerprints";
import { footer } from "../../support/util";
import { ConfirmUpdate } from "./confirmUpdate";

export function askAboutBroadcast(cli: CommandListenerInvocation, name: string, version: string, fp: string) {
    const author = cli.context.source.slack.user.id;
    return cli.addressChannels(
        {
            attachments:
                [{
                    author_name: "Broadcast Library Target",
                    author_icon: `https://images.atomist.com/rug/warning-yellow.png`,
                    text: `Shall we nudge everyone with a PR for ${codeLine(`${name}:${version}`)}?`,
                    fallback: `Boardcast PR for ${name}:${version}`,
                    color: "#ffcc00",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            {
                                text: "Broadcast",
                            },
                            BroadcastNudge,
                            { name, version, author, fp},
                        ),
                    ],
                    footer: footer(),
                }],
        },
    );
}

// ------------------------------
// broadcast nudge
// ------------------------------

export interface BroadcastNudgeParameters {
    name: string;
    version: string;
    reason: string;
    author: string;
    fp: string;
}

function broadcastNudge(cli: CommandListenerInvocation<BroadcastNudgeParameters>): Promise<any> {
    const msgId = `broadcastNudge-${cli.parameters.name}-${cli.parameters.version}`;
    return goals.broadcast(
        queryFingerprints(cli.context.graphClient),
        {
            name: cli.parameters.name,
            version: cli.parameters.version,
            fp: cli.parameters.fp,
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
                        fallback: "Library Update",
                        mrkdwn_in: ["text"],
                        color: "#ffcc00",
                    },
                    {
                        text: `Shall we update library \`${cli.parameters.name}\` to ${bold(cli.parameters.version)}?`,
                        fallback: "none",
                        actions: [
                            actionableButton(
                                {
                                    text: "Raise PR",
                                },
                                ConfirmUpdate,
                                {
                                    msgId,
                                    name: cli.parameters.name,
                                    version: cli.parameters.version,
                                },
                            ),
                        ],
                        color: "#ffcc00",
                        footer: footer(),
                        callback_id: "atm-confirm-done",
                    },
                ],
            };
            return cli.context.messageClient.addressChannels(message, channel, {id: msgId});
        },
    );
}

export const BroadcastNudge: CommandHandlerRegistration<BroadcastNudgeParameters> = {
    name: "BroadcastNudge",
    description: "message all Channels linked to Repos that contain a library",
    parameters: {
        name: {
            required: true,
        },
        version: {
            required: true,
        },
        fp: {
            required: false,
            description: "npm-project-deps, maven-project-deps, or clojure-project-deps",
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
};
