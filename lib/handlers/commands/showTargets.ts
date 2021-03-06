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
    menuForCommand,
    Parameter,
    Parameters,
    SlackFileMessage,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    slackQuestionMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import {
    fromName,
    getFPTargets,
    queryPreferences,
    toName,
} from "../../adhoc/preferences";
import { FP } from "../../machine/Aspect";
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

            const { type, name } = fromName(cli.parameters.fingerprint);
            const fp: FP = await queryPreferences(cli.context.graphClient, type, name);

            const message: SlackFileMessage = {
                title: `current target for ${cli.parameters.fingerprint}`,
                content: JSON.stringify(fp, undefined, 2),
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

            const message = slackQuestionMessage(
                "Fingerprint Target",
                `Choose one of the current fingerprints to list`,
                {
                    actions: [
                        menuForCommand(
                            {
                                text: "select fingerprint",
                                options: [
                                    ...fps.map(x => {
                                        return {
                                            value: toName(x.type, x.name),
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
                });

            return cli.addressChannels(message);
        },
    };
}
