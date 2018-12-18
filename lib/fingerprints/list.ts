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
    menuForCommand,
    SlackFileMessage,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import { queryFingerprintsByBranchRef, queryFingerprintOnShaByName } from "../adhoc/fingerprints";
import { SlackMessage } from "@atomist/slack-messages";
import { GetAllFingerprintsOnSha, GetFingerprintOnShaByName } from "../typings/types";
import { renderData } from "../..";

@Parameters()
export class ListFingerprintParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: false , description: "pull fingerprints from a branch ref"})
    public branch: string;
}

@Parameters()
export class ListOneFingerprintParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: true , description: "pull fingerprints from a branch ref"})
    public branch: string;

    @Parameter({ required: true, description: "the fingerprint to render"})
    public fingerprint: string;
}

export const ListFingerprint: CommandHandlerRegistration<ListOneFingerprintParameters> = {
    name: "ListFingerprint",
    description: "list one fingerprint",
    paramsMaker: ListOneFingerprintParameters,
    intent: "listFingerprint",
    listener: async cli => {

        const query: GetFingerprintOnShaByName.Query = await queryFingerprintOnShaByName(cli.context.graphClient)(
            cli.parameters.repo,
            cli.parameters.owner,
            cli.parameters.branch,
            cli.parameters.fingerprint
        );

        var fingerprint = query.Repo[0].branches[0].commit.fingerprints[0];
        fingerprint.data = JSON.parse(fingerprint.data);
        
        const message: SlackFileMessage = {
            title: `fingerprint ${cli.parameters.fingerprint} currently on ${cli.parameters.owner}/${cli.parameters.repo}`,
            content: renderData(fingerprint),
            fileType: "text",
        };

        return cli.addressChannels(message);
    }
}

export const ListFingerprints: CommandHandlerRegistration<ListFingerprintParameters> = {
    name: "ListFingerprints",
    intent: "listFingerprints",
    description: "list the fingerprints on a particular ref",
    paramsMaker: ListFingerprintParameters,
    listener: async cli => {

        // this has got to be wrong.  ugh
        const branch: string = cli.parameters.branch || "master";

        const query: GetAllFingerprintsOnSha.Query = await queryFingerprintsByBranchRef(cli.context.graphClient)(
            cli.parameters.repo,
            cli.parameters.owner,
            branch);
        const fps: GetAllFingerprintsOnSha.Fingerprints[] = query.Repo[0].branches[0].commit.fingerprints;

        const message: SlackMessage = {
            attachments: [
                {
                    fallback: "select fingerprint",
                    actions: [
                        menuForCommand(
                            {
                                text: "fingerprints",
                                options: [
                                    ...fps.map(x => {
                                        return {
                                            value: x.name,
                                            text: x.name,
                                        }
                                    })
                                ],
                            },
                            ListFingerprint,
                            "fingerprint",
                            {
                                owner: cli.parameters.owner,
                                repo: cli.parameters.repo,
                                branch,
                                providerId: cli.parameters.providerId,
                            },
                        )
                    ]
                }
            ]
        };

        return cli.addressChannels(message);
    },
};
