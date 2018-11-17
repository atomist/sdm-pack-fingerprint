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

import { GraphClient, Parameter, Parameters } from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";
import * as goals from "../../fingerprints/index";
import { queryFingerprintBySha } from "../adhoc/fingerprints";
import { mutatePreference, queryPreferences } from "../adhoc/preferences";

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true})
    public sha: string;

    @Parameter({ required: true })
    public name: string;
}

async function setTeamTargetFingerprint(client: GraphClient, cli: CommandListenerInvocation<UpdateTargetFingerprintParameters>) {
    return goals.setGoalFingerprint(
        queryPreferences(cli.context.graphClient),
        queryFingerprintBySha(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.name,
        cli.parameters.sha,
    );
}

export function updateTargetFingerprint(client: GraphClient): CommandHandlerRegistration<UpdateTargetFingerprintParameters> {
    return {
        name: "UpdateTargetFingerprint",
        intent: "set library target",
        description: "set a new target for a team to consume a particular version",
        paramsMaker: UpdateTargetFingerprintParameters,
        listener: async cli => setTeamTargetFingerprint(client, cli),
    };
}
