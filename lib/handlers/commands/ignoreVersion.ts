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
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    CommandListenerInvocation,
} from "@atomist/sdm";
import * as goals from "../../../fingerprints/index";
import {
    mutateIgnores,
    queryPreferences,
} from "../../adhoc/preferences";

@Parameters()
export class IgnoreVersionParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: true })
    public name: string;

    @Parameter({ required: true })
    public version: string;
}

async function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return goals.withNewIgnore(
        queryPreferences(cli.context.graphClient),
        mutateIgnores(cli.context.graphClient),
        {
            owner: cli.parameters.owner,
            repo: cli.parameters.repo,
            name: cli.parameters.name,
            version: cli.parameters.version,
        },
    ).then(v => {
        if (v) {
            return cli.addressChannels(`now ignoring ${cli.parameters.name}/${cli.parameters.version}`);
        } else {
            return cli.addressChannels("failed to update ignore");
        }
    });
}

export const IgnoreVersion: CommandHandlerRegistration<IgnoreVersionParameters> = {
    name: "LibraryImpactIgnoreVersion",
    description: "Allow a Project to skip one version of library goal",
    paramsMaker: IgnoreVersionParameters,
    listener: async cli => ignoreVersion(cli),
};
