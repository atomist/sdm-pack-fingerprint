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
    ParameterType,
    QueryNoCacheOptions,
    RepoRef,
} from "@atomist/automation-client";
import { successfulEdit } from "@atomist/automation-client/lib/operations/edit/projectEditor";
import { isProject } from "@atomist/automation-client/lib/project/Project";
import {
    CodeTransform,
    CodeTransformRegistration,
    CommandHandlerRegistration,
    confirmEditedness,
    createJob,
    PushAwareParametersInvocation,
    slackErrorMessage,
    slackInfoMessage,
    slackSuccessMessage,
    SoftwareDeliveryMachine,
    TransformPresentation,
    TransformReturnable,
} from "@atomist/sdm";
import {
    bold,
    codeLine,
    italic,
} from "@atomist/slack-messages";
import { findTaggedRepos } from "../../adhoc/fingerprints";
import {
    fromName,
    queryPreferences,
} from "../../adhoc/preferences";
import {
    ApplyPolicyState,
    PolicyLog,
    sendPolicyLog,
} from "../../log/policyLog";
import {
    Aspect,
    FP,
} from "../../machine/Aspect";
import {
    aspectOf,
    displayName,
    displayValue,
} from "../../machine/Aspects";
import {
    applyFingerprintTitle,
    fingerprintTag,
    prBodyFromFingerprint,
} from "../../support/messages";
import {
    FindOtherRepos,
    GetFpBySha,
} from "../../typings/types";
import {
    rebaseCodeTransform,
    RebaseOptions,
} from "./rebase";

// tslint:disable:max-file-line-count

/**
 * Call relevant apply functions from Registrations for a Fingerprint
 * This happens in the context of an an editable Project
 */
async function pushFingerprint(
    p: GitProject,
    papi: PushAwareParametersInvocation<any>,
    aspects: Aspect[],
    fp: FP): Promise<TransformReturnable | undefined> {

    const aspect = aspectOf(fp, aspects);
    if (!!aspect && !!aspect.apply) {

        const value = displayValue(aspectOf(fp, aspects), fp);
        const dName = displayName(aspectOf(fp, aspects), fp);

        let result: TransformReturnable;
        try {
            result = (await aspect.apply(p, { ...papi, parameters: { fp } }));

            // Figure out if the edit was successful or not
            let editResult;
            if (isProject(result)) {
                editResult = successfulEdit(result, !(await p.gitStatus()).isClean);
            } else if (!result) {
                editResult = successfulEdit(p, !(await p.gitStatus()).isClean);
            } else {
                editResult = await confirmEditedness(result);
            }

            if (!!editResult) {
                if (!editResult.success) {
                    const error = !!editResult.error && !!editResult.error.message
                        ? `:\n\n${editResult.error.message}`
                        : "";
                    const message = `Application of target ${value} to ${p.id.owner}/${p.id.repo} failed${error}`;

                    const log: PolicyLog = {
                        type: fp.type,
                        name: fp.name,
                        apply: {
                            _sha: (await p.gitStatus()).sha,
                            branch: p.id.branch,
                            state: ApplyPolicyState.Failure,
                            targetSha: fp.sha,
                            message,
                        },
                    };
                    await sendPolicyLog(log, papi.context);

                    await papi.addressChannels(
                        slackErrorMessage(
                            "Apply Target",
                            `Application of target ${italic(dName)} ${codeLine(value)} to ${codeLine((await p.gitStatus()).sha.slice(0, 7))} of ${
                                bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}`)} failed`,
                            papi.context),
                        { id: papi.parameters.msgId });

                } else if (!editResult.edited) {
                    const message = `Application of target ${value} to ${p.id.owner}/${p.id.repo} made no changes`;
                    const log: PolicyLog = {
                        type: fp.type,
                        name: fp.name,
                        apply: {
                            _sha: (await p.gitStatus()).sha,
                            branch: p.id.branch,
                            state: ApplyPolicyState.NoChange,
                            targetSha: fp.sha,
                            message,
                        },
                    };
                    await sendPolicyLog(log, papi.context);

                    await papi.addressChannels(
                        slackInfoMessage(
                            "Apply Target",
                            `Application of target ${italic(dName)} ${codeLine(value)} to ${codeLine((await p.gitStatus()).sha.slice(0, 7))} of ${
                                bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}`)} made no changes`),
                        { id: papi.parameters.msgId });
                } else {
                    await papi.addressChannels(
                        slackSuccessMessage(
                            "Apply Target",
                            `Successfully applied target ${italic(dName)} ${codeLine(value)} to ${codeLine((await p.gitStatus()).sha.slice(0, 7))} of ${
                                bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}`)}`),
                        { id: papi.parameters.msgId });
                }
            }
        } catch (e) {

            const log: PolicyLog = {
                type: fp.type,
                name: fp.name,
                apply: {
                    _sha: (await p.gitStatus()).sha,
                    branch: p.id.branch,
                    state: ApplyPolicyState.Failure,
                    targetSha: fp.sha,
                    message: e.message,
                },
            };
            await sendPolicyLog(log, papi.context);

            await papi.addressChannels(
                slackErrorMessage(
                    "Apply Target",
                    `Application of target ${italic(dName)} ${codeLine(value)} to ${(await p.gitStatus()).sha.slice(0, 7)} of ${
                        bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}`)} failed`,
                    papi.context),
                { id: papi.parameters.msgId });

            throw e;
        }

        return result;
    }
}

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform is takes one target Fingerprint in it's set of parameters.
 */
export function runAllFingerprintAppliers(aspects: Aspect[]): CodeTransform<ApplyTargetFingerprintParameters> {
    return async (p, cli) => {

        const { type, name } = fromName(cli.parameters.targetfingerprint);

        const fingerprint = await queryPreferences(
            cli.context.graphClient,
            type,
            name);

        const aspect = aspectOf({ type }, aspects);
        let details;
        if (!!aspect) {
            details = `${bold(aspect.displayName)}\n${italic(displayName(aspect, fingerprint))} > ${codeLine(displayValue(aspect, fingerprint))}`;
        } else {
            details = codeLine(cli.parameters.targetfingerprint);
        }

        const message = slackInfoMessage(
            "Apply Target",
            `Applying target to ${bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}:`)}

${details}`);
        await cli.addressChannels(message, { id: cli.parameters.msgId });

        if (!cli.parameters.title) {
            cli.parameters.title = applyFingerprintTitle(fingerprint, aspects);
        }
        if (!cli.parameters.body) {
            cli.parameters.body = prBodyFromFingerprint(fingerprint, aspects);
        }

        if (!cli.parameters.message) {
            cli.parameters.message =
                `${applyFingerprintTitle(fingerprint, aspects)}\n\n${fingerprintTag(cli.parameters.targetfingerprint, fingerprint.sha)}`;
        }

        return pushFingerprint(
            (p as GitProject),
            cli,
            aspects,
            fingerprint,
        );
    };
}

export function runFingerprintAppliersBySha(aspects: Aspect[]): CodeTransform<ApplyTargetFingerprintByShaParameters> {
    return async (p, cli) => {

        const { type, name } = fromName(cli.parameters.targetfingerprint);

        const fp = await cli.context.graphClient.query<GetFpBySha.Query, GetFpBySha.Variables>({
            name: "GetFpBySha",
            variables: {
                type,
                name,
                sha: cli.parameters.sha,
            },
            options: QueryNoCacheOptions,
        });

        const fingerprint = {
            type,
            name,
            data: JSON.parse(fp.SourceFingerprint.data),
            sha: fp.SourceFingerprint.sha,
            displayName: fp.SourceFingerprint.displayName,
            displayValue: fp.SourceFingerprint.displayValue,
        };

        const aspect = aspectOf({ type }, aspects);
        let details;
        if (!!aspect) {
            details = `${bold(aspect.displayName)}\n${italic(displayName(aspect, fingerprint))} > ${codeLine(displayValue(aspect, fingerprint))}`;
        } else {
            details = `${italic(fingerprint.displayName)} > ${codeLine(fingerprint.displayValue)}`;
        }

        const message = slackInfoMessage(
            "Apply Target",
            `Applying target to ${bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}:`)}

${details}`);

        await cli.addressChannels(message, { id: cli.parameters.msgId });

        if (!cli.parameters.title) {
            cli.parameters.title = applyFingerprintTitle(fingerprint, aspects);
        }
        if (!cli.parameters.body) {
            cli.parameters.body = prBodyFromFingerprint(fingerprint, aspects);
        }
        if (!cli.parameters.message) {
            cli.parameters.message =
                `${applyFingerprintTitle(fingerprint, aspects)}\n\n${fingerprintTag(cli.parameters.targetfingerprint, fingerprint.sha)}`;
        }

        return pushFingerprint(
            (p as GitProject),
            cli,
            aspects,
            fingerprint);
    };
}

/**
 * Create a CodeTransform that can be used to apply a Fingerprint to a Project
 * This CodeTransform takes a set of Fingerprints in it's set of parameters
 */
function runEveryFingerprintApplication(aspects: Aspect[]): CodeTransform<ApplyTargetFingerprintsParameters> {
    return async (p, cli) => {

        const fingerprints = cli.parameters.fingerprints.split(",").map(fp => fp.trim());

        const details = fingerprints.map(f => {
            const { type, name } = fromName(f);
            const aspect = aspectOf({ type }, aspects);
            let detail;
            if (!!aspect) {
                detail = `${bold(aspect.displayName)}\n${italic(displayName(aspect, { name } as any))}`;
            } else {
                detail = codeLine(f);
            }
            return detail;
        });

        const message = slackInfoMessage(
            "Apply Policies",
            `Applying policies to ${bold(`${p.id.owner}/${p.id.repo}/${p.id.branch}`)}:

${details.join("\n")}`);

        await cli.addressChannels(message, { id: cli.parameters.msgId });

        for (const fpName of fingerprints) {
            const { type, name } = fromName(fpName.trim());
            const result = await pushFingerprint(
                (p as GitProject),
                cli,
                aspects,
                await queryPreferences(
                    cli.context.graphClient,
                    type,
                    name));
            if (!result) {
                return { edited: false, success: true, target: p };
            }
        }
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

export const ApplyTargetFingerprintName = "ApplyTargetFingerprint";

export function applyTarget(
    sdm: SoftwareDeliveryMachine,
    aspects: Aspect[],
    presentation: TransformPresentation<ApplyTargetParameters>,
    rebase: RebaseOptions): CodeTransformRegistration<ApplyTargetFingerprintParameters> {

    return {
        name: ApplyTargetFingerprintName,
        intent: [
            `apply fingerprint target ${sdm.configuration.name.replace("@", "")}`,
            `applyFingerprint ${sdm.configuration.name.replace("@", "")}`,
        ],
        description: "choose to raise a PR on the current project to apply a target fingerprint",
        parameters: {
            msgId: { required: false, displayable: false },
            targetfingerprint: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        transformPresentation: presentation,
        transform: [rebaseCodeTransform(presentation, rebase), runAllFingerprintAppliers(aspects)],
        autoSubmit: true,
        chatty: false,
    };
}

export interface ApplyTargetFingerprintByShaParameters extends ApplyTargetFingerprintParameters {
    sha: string;
}

export const ApplyTargetFingerprintByShaName = "ApplyTargetFingerprintBySha";

export function applyTargetBySha(
    sdm: SoftwareDeliveryMachine,
    aspects: Aspect[],
    presentation: TransformPresentation<ApplyTargetParameters>,
    rebase: RebaseOptions): CodeTransformRegistration<ApplyTargetFingerprintByShaParameters> {

    return {
        name: ApplyTargetFingerprintByShaName,
        intent: [
            `apply fingerprint target by sha ${sdm.configuration.name.replace("@", "")}`,
        ],
        description: "Apply a fingerprint target identified by the fingerprint's sha and type",
        parameters: {
            msgId: { required: false, displayable: false },
            targetfingerprint: { required: true },
            sha: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        transformPresentation: presentation,
        transform: [rebaseCodeTransform(presentation, rebase), runFingerprintAppliersBySha(aspects)],
        autoSubmit: true,
        concurrency: {
            maxConcurrent: 1,
            requiresJob: true,
        },
        chatty: false,
    };
}

export interface ApplyTargetFingerprintsParameters extends ApplyTargetParameters {
    fingerprints: string;
}

// use where ApplyTargetFingerprints was used
export const ApplyAllFingerprintsName = "ApplyAllFingerprints";

export function applyTargets(
    sdm: SoftwareDeliveryMachine,
    registrations: Aspect[],
    presentation: TransformPresentation<ApplyTargetParameters>,
    rebase: RebaseOptions,
): CodeTransformRegistration<ApplyTargetFingerprintsParameters> {
    return {
        name: ApplyAllFingerprintsName,
        description: "apply a bunch of fingerprints",
        transform: [rebaseCodeTransform(presentation, rebase), runEveryFingerprintApplication(registrations)],
        transformPresentation: presentation,
        parameters: {
            msgId: { required: false, displayable: false },
            fingerprints: { required: true },
            body: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            title: { required: false, displayable: true, control: "textarea", pattern: /[\S\s]*/ },
            branch: { required: false, displayable: false },
        },
        autoSubmit: true,
        chatty: false,
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
    aspects: Aspect[],
): CommandHandlerRegistration<BroadcastFingerprintMandateParameters> {
    return {
        name: BroadcastFingerprintMandateName,
        description: "create a PR in many Repos",
        listener: async i => {

            const refs: RepoRef[] = [];

            const { type, name } = fromName(i.parameters.fingerprint);
            const fp = await queryPreferences(i.context.graphClient, type, name);

            const data: FindOtherRepos.Query = await (findTaggedRepos(i.context.graphClient))(fp.type, fp.name);

            // TODO does the analysis only have the matching tagged repos or all of them?
            if (!!data.headCommitsWithFingerprint) {
                refs.push(
                    ...data.headCommitsWithFingerprint
                        .filter(head => !!head.branch && !!head.branch.name && head.branch.name === "master")
                        .filter(head => head.analysis.some(x => {
                            return x.type === fp.type &&
                                x.name === fp.name &&
                                x.sha !== fp.sha;
                        }))
                        .map(x => {
                                return {
                                    owner: x.repo.owner,
                                    repo: x.repo.name,
                                    url: "url",
                                    branch: "master",
                                };
                            },
                        ),
                );
            }

            const aspect = aspectOf({ type }, aspects);
            const dValue = displayValue(aspect, fp);
            const dName = displayName(aspect, fp);

            await createJob<ApplyTargetFingerprintParameters>({
                command: ApplyTargetFingerprintName,
                description: `Applying target ${dValue} of ${dName} to ${refs.length} affected ${refs.length === 1 ? "repository" : "repositories"}`,
                name: `ApplyPolicy/${i.parameters.fingerprint}`,
                parameters: refs.map(r => ({
                    title: i.parameters.title,
                    body: i.parameters.body,
                    branch: r.branch,
                    targetfingerprint: i.parameters.fingerprint,
                    targets: {
                        owner: r.owner,
                        repo: r.repo,
                        branch: r.branch,
                    },
                })),
                concurrentTasks: 1,
            }, i.context);

            const message = slackSuccessMessage(
                "Broadcast Target Update",
                `Successfully scheduled job to apply target for policy ${bold(name)} to ${
                    refs.length} ${refs.length > 1 ? "repositories" : "repository"}`);

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
