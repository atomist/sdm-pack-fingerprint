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

import { actionableButton, CommandHandlerRegistration } from "@atomist/sdm";
import { bold, SlackMessage } from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import { footer } from "../../support/util";
import { SetTeamLibrary } from "./setLibraryGoal";

export interface UseLatestParameters {
    name: string;
    version: string;
}

export const UseLatest: CommandHandlerRegistration<UseLatestParameters> = {
    name: "UseLatestLibrary",
    description: "use the latest library",
    intent: "use latest",
    parameters: {
        name: {required: true},
    },
    listener: async cli => {
        const latest: string = await goals.npmLatest(cli.parameters.name);
        const message: SlackMessage = {
            attachments: [
                {
                    text: `Shall we update library \`${cli.parameters.name}\` to ${bold(latest)}?`,
                    fallback: "none",
                    actions: [
                        actionableButton(
                            {
                                text: "Set Target",
                            },
                            SetTeamLibrary,
                            {
                                name: cli.parameters.name,
                                version: latest,
                                fp: "npm-project-deps",
                            },
                        ),
                    ],
                    color: "#ffcc00",
                    footer: footer(),
                    callback_id: "atm-confirm-done",
                },
            ],
        };
        return cli.addressChannels(message);
    },
};
