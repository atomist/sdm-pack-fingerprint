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
    MappedParameter,
    MappedParameters,
    menuForCommand,
    Parameter,
    Parameters,
    SlackFileMessage,
} from "@atomist/automation-client";
import { renderData } from "@atomist/clj-editors";
import {
    CommandHandlerRegistration,
    slackQuestionMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { queryFingerprintsByBranchRef } from "../../adhoc/fingerprints";
import {
    fromName,
    toName,
} from "../../adhoc/preferences";
import { comparator } from "../../support/util";
import { GetAllFpsOnSha } from "../../typings/types";

@Parameters()
export class ListFingerprintParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: false, description: "pull fingerprints from a branch ref" })
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

    @Parameter({ required: true, description: "pull fingerprints from a branch ref" })
    public branch: string;

    // contains the name and type
    @Parameter({ required: true, description: "the fingerprint to render" })
    public fingerprint: string;
}

export function listFingerprint(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<ListOneFingerprintParameters> {
    return {
        name: "ListFingerprint",
        description: "list one fingerprint",
        paramsMaker: ListOneFingerprintParameters,
        listener: async cli => {

            const fps: GetAllFpsOnSha.Analysis[] = await queryFingerprintsByBranchRef(cli.context.graphClient)(
              cli.parameters.repo,
              cli.parameters.owner,
              cli.parameters.branch,
            );

            const { type, name } = fromName(cli.parameters.fingerprint);
            logger.info(`searching for ${type} and ${name}`);
            logger.info(`choose from ${JSON.stringify(fps)}`);
            const fingerprint: GetAllFpsOnSha.Analysis = fps.find(x => x.name === name && x.type === type);

            fingerprint.data = JSON.parse(fingerprint.data);

            const message: SlackFileMessage = {
                title: `fingerprint ${cli.parameters.fingerprint} currently on ${cli.parameters.owner}/${cli.parameters.repo}`,
                content: renderData(fingerprint),
                fileType: "text",
            };

            return cli.addressChannels(message);
        },
    };
}

function shortenName(s: string): string {
    if (s.length >= 30) {
        return "..." + s.substring(s.length - 27);
    } else {
        return s;
    }
}

export function listFingerprints(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<ListFingerprintParameters> {
    return {
        name: "ListFingerprints",
        intent: [
          `list fingerprints ${sdm.configuration.name.replace("@", "")}`,
          `listFingerprints ${sdm.configuration.name.replace("@", "")}`,
        ],
        description: "list the fingerprints on a particular ref",
        paramsMaker: ListFingerprintParameters,
        listener: async cli => {

            // this has got to be wrong.  ugh
            const branch: string = cli.parameters.branch || "master";

            const fps: GetAllFpsOnSha.Analysis[] = await queryFingerprintsByBranchRef(cli.context.graphClient)(
              cli.parameters.repo,
              cli.parameters.owner,
              branch);

            const message = slackQuestionMessage(
              "Fingerprint Target",
              `Choose a fingerprint`,
              {
                  actions: [
                      menuForCommand(
                        {
                            text: "select fingerprint",
                            options: [
                                ...fps.sort(comparator("name")).map(x => {
                                    return {
                                        value: toName(x.type, x.name),
                                        text: shortenName(x.name),
                                    };
                                }),
                            ],
                        },
                        listFingerprint(sdm).name,
                        "fingerprint",
                        {
                            owner: cli.parameters.owner,
                            repo: cli.parameters.repo,
                            branch,
                            providerId: cli.parameters.providerId,
                        },
                      ),
                  ],
              });

            return cli.addressChannels(message);
        },
    };
}
