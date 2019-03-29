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
    ParameterType,
} from "@atomist/automation-client";
import {
    CodeTransform,
    CodeTransformRegistration,
    slackFooter,
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
} from "../../machine/fingerprintSupport";

/**
 * Call relevant apply functions from Registrations for a Fingerprint
 * This happens in the context of an an editable Project
 *
 * @param message a callback function if you would like notify about an error
 * @param p the Project
 * @param registrations all of the current Registrations containing apply functions
 * @param fp the fingerprint to apply
 */
async function pushFingerprint(message: (s: string) => Promise<any>,
                               p: GitProject,
                               registrations: FingerprintRegistration[], fp: FP): Promise<GitProject> {

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

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform is takes one target Fingerprint in it's set of parameters.
 *
 * @param registrations
 */
function runAllFingerprintAppliers(registrations: FingerprintRegistration[]): CodeTransform<ApplyTargetFingerprintParameters> {
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
                    footer: slackFooter(),
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

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform takes a set of Fingerprints in it's set of parameters
 *
 * @param registrations
 */
function runEveryFingerprintApplication(registrations: FingerprintRegistration[]): CodeTransform<ApplyTargetFingerprintsParameters> {
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
                    footer: slackFooter(),
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

export interface ApplyTargetParameters extends ParameterType {
    msgId?: string;
    body: string;
    title: string;
}

export interface ApplyTargetFingerprintParameters extends ApplyTargetParameters {
    fingerprint: string;
}

/**
 * embedd in an action when we broadcast this CodeTransform into other channels
 */
export let ApplyTargetFingerprint: CodeTransformRegistration<ApplyTargetFingerprintParameters>;

export function compileApplyTarget(
    sdm: SoftwareDeliveryMachine,
    registrations: FingerprintRegistration[],
    presentation: EditModeMaker): CodeTransformRegistration<ApplyTargetFingerprintParameters> {

    ApplyTargetFingerprint = {
        name: "ApplyTargetFingerprint",
        intent: "applyFingerprint",
        description: "choose to raise a PR on the current project to apply a target fingerprint",
        parameters: {
            msgId: { required: false, displayable: false },
            fingerprint: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
        },
        transformPresentation: presentation,
        transform: runAllFingerprintAppliers(registrations),
        autoSubmit: true,
    };

    sdm.addCodeTransformCommand(ApplyTargetFingerprint);

    return ApplyTargetFingerprint;
}

export interface ApplyTargetFingerprintsParameters extends ApplyTargetParameters {
    fingerprints: string;
}

export let ApplyTargetFingerprints: CodeTransformRegistration<ApplyTargetFingerprintsParameters>;

export function compileApplyTargets(
    sdm: SoftwareDeliveryMachine,
    registrations: FingerprintRegistration[],
    presentation: EditModeMaker,
): CodeTransformRegistration<ApplyTargetFingerprintsParameters> {

    ApplyTargetFingerprints = {
        name: "ApplyAllFingerprints",
        description: "apply a bunch of fingerprints",
        transform: runEveryFingerprintApplication(registrations),
        transformPresentation: presentation,
        parameters: {
            msgId: { required: false, displayable: false },
            fingerprints: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
        },
        autoSubmit: true,
    };

    sdm.addCodeTransformCommand(ApplyTargetFingerprints);

    return ApplyTargetFingerprints;
}
