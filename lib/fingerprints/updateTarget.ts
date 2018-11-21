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
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import * as goals from "../../fingerprints/index";
import { queryFingerprintBySha } from "../adhoc/fingerprints";
import {
    mutatePreference,
    queryPreferences,
} from "../adhoc/preferences";
import { askAboutBroadcast } from "./broadcast";

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true })
    public sha: string;

    @Parameter({ required: true })
    public name: string;
}

export const UpdateTargetFingerprint: CommandHandlerRegistration<UpdateTargetFingerprintParameters> = {
    name: "RegisterTargetFingerprint",
    intent: "set fingerprint goal",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: UpdateTargetFingerprintParameters,
    listener: async cli => {
        await cli.context.messageClient.respond(`updating the goal state for all ${cli.parameters.name} fingerprints`);
        await goals.setGoalFingerprint(
            queryPreferences(cli.context.graphClient),
            queryFingerprintBySha(cli.context.graphClient),
            mutatePreference(cli.context.graphClient),
            cli.parameters.name,
            cli.parameters.sha,
        );
        return askAboutBroadcast(cli, cli.parameters.name, "version", cli.parameters.sha);
    },
};
