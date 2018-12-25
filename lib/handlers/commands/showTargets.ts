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
    logger,
    menuForCommand,
    Parameter,
    Parameters,
    SlackFileMessage,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
} from "@atomist/sdm";

import { SlackMessage } from "@atomist/slack-messages";
import {
    FP,
    fpPreference,
    fpPreferences,
    renderData,
} from "../../../fingerprints/index";
import {
    queryPreferences,
} from "../../adhoc/preferences";
import { ChatTeamPreferences } from "../../typings/types";
import { comparator } from "../../support/util";

export const DumpLibraryPreferences: CommandHandlerRegistration = {
    name: "DumpLibraryPreferences",
    description: "dump current prefs into a JSON file",
    intent: "dump preferences",
    listener: async cli => {
        const query = queryPreferences(cli.context.graphClient);
        return query()
        .then(
            result => {
                const message: SlackFileMessage = {
                    title: "library prefs",
                    content: renderData(result),
                    fileType: "text",
                };
                return cli.addressChannels(message);
            },
        ).catch(
            error => {
                return cli.addressChannels(`unable to fetch preferences ${error}`);
            },
        );
    },
};

@Parameters()
export class ListOneFingerprintTargetParameters {
    @Parameter({required: true, description: "fingerprint to display"})
    public fingerprint: string;
}

export const ListOneFingerprintTarget: CommandHandlerRegistration<ListOneFingerprintTargetParameters> = {
    name: "ListOneFingerprintTarget",
    description: "list a single fingerprint target",
    paramsMaker: ListOneFingerprintTargetParameters,
    intent: "listOneFingerprintTarget",
    listener: async cli => {
        const query: ChatTeamPreferences.Query = await (queryPreferences(cli.context.graphClient))();

        const fp: FP = fpPreference(query, cli.parameters.fingerprint);
        logger.info(`fps ${renderData(fp)}`);

        const message: SlackFileMessage = {
            title: `current target for ${cli.parameters.fingerprint}`,
            content: renderData(fp),
            fileType: "text",
        };

        return cli.addressChannels(message);
    },
};

export const ListFingerprintTargets: CommandHandlerRegistration = {
    name: "ListFingerprintTargets",
    description: "list all current fingerprint targets",
    intent: "listFingerprintTargets",
    listener: async cli => {

        const query: ChatTeamPreferences.Query = await (queryPreferences(cli.context.graphClient))();

        const fps: FP[] = fpPreferences(query).sort(comparator("name"));

        const message: SlackMessage = {
            attachments: [
                {
                    text: "Choose one of the current fingerprints",
                    fallback: "select fingerprint",
                    actions: [
                        menuForCommand(
                            {
                                text: "select fingerprint",
                                options: [
                                    ...fps.map(x => {
                                        return {
                                            value: x.name,
                                            text: x.name,
                                        };
                                    }),
                                ],
                            },
                            ListOneFingerprintTarget.name,
                            "fingerprint",
                            {},
                        ),
                    ],
                },
            ],
        };

        return cli.addressChannels(message);
    },
};
