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
    GitProject,
    guid,
    logger,
} from "@atomist/automation-client";
import {
    branchAwareCodeTransform,
    CodeTransform,
    CodeTransformRegistration,
    CommandHandlerRegistration,
    RepoTargetingParameters,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import {
    applyFingerprint,
    FP,
    getFingerprintPreference,
} from "../../../fingerprints/index";
import { queryPreferences } from "../../adhoc/preferences";
import {
    EditModeMaker,
    FingerprintRegistration,
} from "../../machine/FingerprintSupport";
import { footer } from "../../support/util";

async function pushFingerprint( message: (s: string) => Promise<any>, p: GitProject, registrations: FingerprintRegistration[], fp: FP) {

    logger.info(`transform running -- ${fp.name}/${fp.sha} --`);

    for (const registration of registrations) {
        if (registration.apply && registration.selector(fp)) {
            const result: boolean = await registration.apply(p, fp);
            if (!result) {
                await message(`failure applying fingerprint ${fp.name}`);
            }
        }
    }

    await applyFingerprint(p.baseDir, fp);

    return p;
}

function runAllFingerprintAppliers( registrations: FingerprintRegistration[]): CodeTransform<ApplyTargetFingerprintParameters> {
    return async (p, cli) => {

        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Apply target fingerprint",
                    author_icon: `https://images.atomist.com/rug/check-circle.gif?gif=${guid()}`,
                    text: `Applying target fingerprint \`${cli.parameters.fingerprint}\` to <https://github.com/${
                        p.id.owner}/${p.id.repo}|${p.id.owner}/${p.id.repo}>`,
                    mrkdwn_in: ["text"],
                    color: "#45B254",
                    fallback: "none",
                    footer: footer(),
                },
            ],
        };

        await cli.addressChannels(message);

        return pushFingerprint(
            async (s: string) => cli.addressChannels(s),
            (p as GitProject),
            registrations,
            await getFingerprintPreference(
                queryPreferences(cli.context.graphClient),
                cli.parameters.fingerprint));
    };
}
function runEveryFingerprintApplication( registrations: FingerprintRegistration[]): CodeTransform<ApplyTargetFingerprintsParameters> {
    return async (p, cli) => {

        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Apply target fingerprints",
                    author_icon: `https://images.atomist.com/rug/check-circle.gif?gif=${guid()}`,
                    text: `Applying target fingerprints \`${cli.parameters.fingerprints}\` to <https://github.com/${
                        p.id.owner}/${p.id.repo}|${p.id.owner}/${p.id.repo}>`,
                    mrkdwn_in: ["text"],
                    color: "#45B254",
                    fallback: "none",
                    footer: footer(),
                },
            ],
        };

        await cli.addressChannels(message);

        await Promise.all(
            cli.parameters.fingerprints.split(",").map(
                async fpName => {
                    return pushFingerprint(
                        async (s: string) => cli.addressChannels(s),
                        (p as GitProject),
                        registrations,
                        await getFingerprintPreference(
                            queryPreferences(cli.context.graphClient),
                            fpName));
                },
            ),
        );
        return p;
    };
}

export interface ApplyTargetParameters {
    title: string;
    body: string;
    msgId?: string;
}

export interface ApplyTargetFingerprintParameters extends ApplyTargetParameters {
    fingerprint: string;
}

export let ApplyTargetFingerprint: CodeTransformRegistration<ApplyTargetFingerprintParameters>;

function createApplyTargetFingerprintRegistration(
    registrations: FingerprintRegistration[],
    presentation: EditModeMaker ): CodeTransformRegistration<ApplyTargetFingerprintParameters> {

    ApplyTargetFingerprint =  {
        name: "ApplyTargetFingerprint",
        intent: "applyFingerprint",
        description: "choose to raise a PR on the current project to apply a target fingerprint",
        parameters: {
            msgId: {required: false, displayable: false},
            title: {required: true, displayable: true, control: "textarea", pattern: /[\S\s]*/},
            body: {required: true, displayable: true, control: "textarea", pattern: /[\S\s]*/},
            fingerprint: {required: true},
        },
        transformPresentation: presentation,
        transform: runAllFingerprintAppliers(registrations),
        autoSubmit: true,
    };
    return ApplyTargetFingerprint;
}

export interface ApplyTargetFingerprintsParameters extends ApplyTargetParameters {
    fingerprints: string;
}

function createApplyTargetFingerprintsRegistration(
    registrations: FingerprintRegistration[],
    presentation: EditModeMaker,
    ): CodeTransformRegistration<ApplyTargetFingerprintsParameters> {

    return {
        name: "ApplyAllFingerprints",
        description: "apply a bunch of fingerprints",
        transform: runEveryFingerprintApplication(registrations),
        transformPresentation: presentation,
        parameters: {
            msgId: {required: false, displayable: false},
            title: {required: true, displayable: true, control: "textarea", pattern: /[\S\s]*/},
            body: {required: true, displayable: true, control: "textarea", pattern: /[\S\s]*/},
            fingerprints: {required: true},
        },
        autoSubmit: true,
    };
}

export let FingerprintApplicationCommandRegistration: CommandHandlerRegistration<RepoTargetingParameters>;
export let ApplyAllFingerprintsCommandRegistration: CommandHandlerRegistration<RepoTargetingParameters>;

export function compileApplyFingerprintCommand(
    registrations: FingerprintRegistration[], presentation: EditModeMaker, sdm: SoftwareDeliveryMachine) {

    FingerprintApplicationCommandRegistration = branchAwareCodeTransform(createApplyTargetFingerprintRegistration(registrations, presentation), sdm);
    return FingerprintApplicationCommandRegistration;
}

export function compileApplyAllFingerprintsCommand(
    registrations: FingerprintRegistration[], presentation: EditModeMaker, sdm: SoftwareDeliveryMachine) {

    ApplyAllFingerprintsCommandRegistration = branchAwareCodeTransform(createApplyTargetFingerprintsRegistration(registrations, presentation), sdm);
    return ApplyAllFingerprintsCommandRegistration;
}
