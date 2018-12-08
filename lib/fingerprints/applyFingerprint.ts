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
    GitProject,
    guid,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import {
    CodeTransform,
    CodeTransformRegistration,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as fingerprints from "../../fingerprints/index";
import { FP } from "../../fingerprints/index";
import { queryPreferences } from "../adhoc/preferences";
import {
    editModeMaker,
    FingerprintRegistration,
} from "../machine/FingerprintSupport";
import { footer } from "../support/util";

@Parameters()
export class ApplyTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: true })
    public fingerprint: string;
}

async function pusher(p: GitProject, registrations: FingerprintRegistration[], fp: FP) {

    logger.info(`transform running -- ${fp} --`);

    for (const registration of registrations) {
        if (registration.apply && registration.selector(fp)) {
            await registration.apply(p, fp);
        }
    }

    await fingerprints.applyFingerprint(p.baseDir, fp);

    return p;
}

function applyFingerprint( registrations: FingerprintRegistration[]): CodeTransform<ApplyTargetFingerprintParameters> {
    return async (p, cli) => {
        // await cli.addressChannels(`make an edit to the project in ${(p as GitProject).baseDir} to go to version ${cli.parameters.version}`);
        await pusher(
            (p as GitProject),
            registrations,
            await fingerprints.getFingerprintPreference(
                queryPreferences(cli.context.graphClient),
                cli.parameters.fingerprint));
        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Apply target fingerprint",
                    author_icon: `https://images.atomist.com/rug/check-circle.gif?gif=${guid()}`,
                    text: `Applying target fingerprint \`${cli.parameters.fingerprint}\` to <https://github.com/${
                        cli.parameters.owner}/${cli.parameters.repo}|${cli.parameters.owner}/${cli.parameters.repo}>`,
                    mrkdwn_in: ["text"],
                    color: "#45B254",
                    fallback: "none",
                    footer: footer(),
                },
            ],
        };
        await cli.addressChannels(message);
        return p;
    };
}

export type FingerprintTransform = (p: GitProject, fp: fingerprints.FP) => Promise<any>;

export let ApplyTargetFingerprint: CodeTransformRegistration<ApplyTargetFingerprintParameters>;

export function applyTargetFingerprint(
    registrations: FingerprintRegistration[],
    presentation: editModeMaker ): CodeTransformRegistration<ApplyTargetFingerprintParameters> {
    ApplyTargetFingerprint = {
        name: "ApplyTargetFingerprint",
        intent: "applyFingerprint",
        description: "choose to raise a PR on the current project to apply a target fingerprint",
        paramsMaker: ApplyTargetFingerprintParameters,
        transformPresentation: presentation,
        transform: applyFingerprint(registrations),
    };
    return ApplyTargetFingerprint;
}
