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
    editModes,
    GitProject,
    logger,
    ParameterType,
    Project,
    RepoRef,
} from "@atomist/automation-client";
import { TargetsParams } from "@atomist/automation-client/lib/operations/common/params/TargetsParams";
import { editAll } from "@atomist/automation-client/lib/operations/edit/editAll";
import {
    AutoMergeMethod,
    AutoMergeMode,
} from "@atomist/automation-client/lib/operations/edit/editModes";
import { EditResult } from "@atomist/automation-client/lib/operations/edit/projectEditor";
import { FP } from "@atomist/clj-editors";
import {
    CodeTransform,
    CodeTransformRegistration,
    CommandHandlerRegistration,
    slackInfoMessage,
    slackSuccessMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import {
    bold,
    codeLine,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import { findTaggedRepos } from "../../adhoc/fingerprints";
import {
    fromName,
    queryPreferences,
} from "../../adhoc/preferences";
import { Feature } from "../../machine/Feature";
import { applyToFeature } from "../../machine/Features";
import { EditModeMaker } from "../../machine/fingerprintSupport";
import { FindLinkedReposWithFingerprint } from "../../typings/types";

/**
 * Call relevant apply functions from Registrations for a Fingerprint
 * This happens in the context of an an editable Project
 *
 * @param message a callback function if you would like notify about an error
 * @param p the Project
 * @param registrations all of the current Registrations containing apply functions
 * @param fp the fingerprint to apply
 */
async function pushFingerprint(
    message: (s: string) => Promise<any>,
    p: GitProject,
    registrations: Feature[],
    fingerprint: FP): Promise<GitProject> {

    logger.info(`transform running -- ${fingerprint.name}/${fingerprint.sha} --`);

    await applyToFeature(fingerprint, async (feature, fp) => {
        if (feature.apply) {
            const result: boolean = await feature.apply(p, fp);
            if (!result) {
                await message(`failure applying fingerprint ${fp.name}`);
            } else {
                logger.info(`successfully applied fingerprint ${fp.name}`);
            }
        }
    });

    return p;
}

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform is takes one target Fingerprint in it's set of parameters.
 *
 * @param registrations
 */
export function runAllFingerprintAppliers(registrations: Feature[]): CodeTransform<ApplyTargetFingerprintParameters> {
    return async (p, cli) => {

        const message = slackInfoMessage(
            "Apply Fingerprint Target",
            `Applying fingerprint target ${codeLine(`${cli.parameters.targetfingerprint}`)} to ${bold(`${p.id.owner}/${p.id.repo}`)}`);

        await cli.addressChannels(message, { id: cli.parameters.msgId });

        const { type, name } = fromName(cli.parameters.targetfingerprint);
        return pushFingerprint(
            async (s: string) => cli.addressChannels(s),
            (p as GitProject),
            registrations,
            await queryPreferences(
                cli.context.graphClient,
                type,
                name));
    };
}

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform takes a set of Fingerprints in it's set of parameters
 *
 * @param registrations
 */
function runEveryFingerprintApplication(registrations: Feature[]): CodeTransform<ApplyTargetFingerprintsParameters> {
    return async (p, cli) => {

        const message = slackInfoMessage(
            "Apply Fingerprint Target",
            `Applying fingerprint target ${codeLine(cli.parameters.fingerprints)} to ${bold(`${p.id.owner}/${p.id.repo}`)}`);

        await cli.addressChannels(message, { id: cli.parameters.msgId });

        // TODO fpName is targetName
        await Promise.all(
            cli.parameters.fingerprints.split(",").map(
                async fpName => {
                    const { type, name } = fromName(fpName);
                    return pushFingerprint(
                        async (s: string) => cli.addressChannels(s),
                        (p as GitProject),
                        registrations,
                        await queryPreferences(
                            cli.context.graphClient,
                            type,
                            name));
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
    branch?: string;
}

export interface ApplyTargetFingerprintParameters extends ApplyTargetParameters {
    targetfingerprint: string;
}

// use where ApplyTargetFingerprint was used
export const ApplyTargetFingerprintName = "ApplyTargetFingerprint";

export function applyTarget(
    sdm: SoftwareDeliveryMachine,
    registrations: Feature[],
    presentation: EditModeMaker): CodeTransformRegistration<ApplyTargetFingerprintParameters> {

    return {
        name: ApplyTargetFingerprintName,
        intent: ["apply fingerprint target", "applyFingerprint"],
        description: "choose to raise a PR on the current project to apply a target fingerprint",
        parameters: {
            msgId: { required: false, displayable: false },
            targetfingerprint: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        transformPresentation: presentation,
        transform: runAllFingerprintAppliers(registrations),
        autoSubmit: true,
    };
}

export interface ApplyTargetFingerprintsParameters extends ApplyTargetParameters {
    fingerprints: string;
}

// use where ApplyTargetFingerprints was used
export const ApplyAllFingerprintsName = "ApplyAllFingerprints";

export function applyTargets(
    sdm: SoftwareDeliveryMachine,
    registrations: Feature[],
    presentation: EditModeMaker,
): CodeTransformRegistration<ApplyTargetFingerprintsParameters> {
    return {
        name: ApplyAllFingerprintsName,
        description: "apply a bunch of fingerprints",
        transform: runEveryFingerprintApplication(registrations),
        transformPresentation: presentation,
        parameters: {
            msgId: { required: false, displayable: false },
            fingerprints: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        autoSubmit: true,
    };
}

export interface BroadcastFingerprintMandateParameters extends ParameterType {
    fingerprint: string;
    title: string;
    body: string;
    msgId?: string;
    branch?: string;
}

export const BroadcastFingerprintMandateName = "BroadcastFingerprintMandate";

export function broadcastFingerprintMandate(
    sdm: SoftwareDeliveryMachine,
    registrations: Feature[],
): CommandHandlerRegistration<BroadcastFingerprintMandateParameters> {
    return {
        name: BroadcastFingerprintMandateName,
        description: "create a PR in many Repos",
        listener: async i => {

            const refs: RepoRef[] = [];

            const { type, name } = fromName(i.parameters.fingerprint);
            const fp = await queryPreferences(i.context.graphClient, type, name);

            // start by running
            logger.info(`run all fingerprint transforms for ${i.parameters.fingerprint}: ${fp.name}/${fp.sha}`);

            const data: FindLinkedReposWithFingerprint.Query = await (findTaggedRepos(i.context.graphClient))(fp.type, fp.name);

            if (!!data.Repo) {
                refs.push(
                    ...data.Repo
                        .filter(repo => _.get(repo, "branches[0].commit.analysis"))
                        .filter(repo => repo.branches[0].commit.analysis.some(x => x.name === fp.name))
                        .map(repo => {
                            return {
                                owner: repo.owner,
                                repo: repo.name,
                                url: "url",
                                branch: "master",
                            };
                        },
                        ),
                );
            }

            const editor: (p: Project) => Promise<EditResult> = async p => {
                await pushFingerprint(
                    async s => i.addressChannels(s),
                    (p as GitProject),
                    registrations,
                    fp,
                );
                return {
                    success: true,
                    target: p,
                };
            };

            // tslint:disable-next-line
            const targets: TargetsParams = ({} as TargetsParams);

            const result: EditResult[] = await editAll(
                i.context,
                i.credentials,
                editor,
                new editModes.PullRequest(
                    `apply-target-fingerprint-${Date.now()}`,
                    `${i.parameters.title}`,
                    `> generated by Atomist \n ${i.parameters.body}`,
                    undefined,
                    "master",
                    {
                        method: AutoMergeMethod.Squash,
                        mode: AutoMergeMode.SuccessfulCheck,
                    },
                ),
                {
                    ...i.parameters,
                    targets,
                },
                async () => {
                    logger.info(`calling repo finder:  ${refs.length}`);
                    return refs;
                },
            );

            const message = slackSuccessMessage(
                "Boardcast Fingerprint Target",
                `Sent fingerprint pull request (${codeLine(i.parameters.fingerprint)}) to all impacted repositories

${result.map(x => `${x.target.name} (${x.success})`).join(", ")}`);

            // replace the previous message where we chose this action
            await i.addressChannels(message, { id: i.parameters.msgId });
        },
        parameters: {
            msgId: { required: false, displayable: false },
            fingerprint: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        autoSubmit: true,
    };
}
