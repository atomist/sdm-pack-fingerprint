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
    logger,
    menuForCommand,
    Parameter,
    Parameters,
    SlackFileMessage,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    slackFooter,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";

import { SlackMessage } from "@atomist/slack-messages";
import {
    FP,
    renderData,
} from "@atomist/clj-editors";
import {
    getFPTargets,
    queryPreferences,
} from "../../adhoc/preferences";
import { comparator } from "../../support/util";
import { GetFpTargets } from "../../typings/types";

@Parameters()
export class ListOneFingerprintTargetParameters {
    @Parameter({ required: true, description: "fingerprint to display" })
    public fingerprint: string;
}

export function listOneFingerprintTarget(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<ListOneFingerprintTargetParameters> {
    return {
        name: "ListOneFingerprintTarget",
        description: "list a single fingerprint target",
        paramsMaker: ListOneFingerprintTargetParameters,
        intent: [`list fingerprint target ${sdm.configuration.name.replace("@", "")}`],
        listener: async cli => {

            const fp: FP = await queryPreferences(cli.context.graphClient, cli.parameters.fingerprint);
            logger.info(`fps ${renderData(fp)}`);

            const message: SlackFileMessage = {
                title: `current target for ${cli.parameters.fingerprint}`,
                content: renderData(fp),
                fileType: "text",
            };

            return cli.addressChannels(message);
        },
    };
}

export function listFingerprintTargets(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration {
    return {
        name: "ListFingerprintTargets",
        description: "list all current fingerprint targets",
        intent: [`list all fingerprint targets ${sdm.configuration.name.replace("@", "")}`],
        listener: async cli => {

            const query: GetFpTargets.Query = await getFPTargets(cli.context.graphClient);

            const fps: FP[] = query.TeamConfiguration
                .map(x => JSON.parse(x.value))
                .sort(comparator("name"));

            const message: SlackMessage = {
                attachments: [
                    {
                        title: "Select Fingerprint",
                        text: "Choose one of the current fingerprints to list",
                        fallback: "Select Fingerprint",
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
                                listOneFingerprintTarget(sdm).name,
                                "fingerprint",
                                {},
                            ),
                        ],
                        footer: slackFooter(),
                    },
                ],
            };

            return cli.addressChannels(message);
        },
    };
}
