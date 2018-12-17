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
    addressSlackChannelsFromContext,
    editModes,
    GitProject,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import {
    actionableButton,
    CommandListenerInvocation,
    ExtensionPack,
    Fingerprint,
    FingerprinterResult,
    Goal,
    metadata,
    PushImpactListener,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import {
    Diff,
    FP,
    renderData,
    Vote,
} from "../../fingerprints/index";
import {
    applyTargetFingerprint,
    ApplyTargetFingerprintParameters,
} from "../fingerprints/applyFingerprint";
import { BroadcastFingerprintNudge } from "../fingerprints/broadcast";
import {
    checkFingerprintTargets,
    MessageMaker,
    votes,
} from "../fingerprints/impact";
import { ListFingerprints } from "../fingerprints/list";
import { getNpmDepFingerprint } from "../fingerprints/npmDeps";
import {
    DeleteTargetFingerprint,
    setNewTargetFingerprint,
    SetTargetFingerprint,
    SetTargetFingerprintFromLatestMaster,
    UpdateTargetFingerprint,
} from "../fingerprints/updateTarget";
import { BroadcastNudge } from "../handlers/commands/broadcast";
import { ConfirmUpdate } from "../handlers/commands/confirmUpdate";
import { IgnoreVersion } from "../handlers/commands/ignoreVersion";
import {
    ChooseTeamLibrary,
    SetTeamLibrary,
} from "../handlers/commands/setLibraryGoal";
import {
    ClearLibraryTargets,
    DumpLibraryPreferences,
    ShowGoals,
    ShowTargets,
} from "../handlers/commands/showTargets";
import { UseLatest } from "../handlers/commands/useLatest";
import { PullRequestImpactHandlerRegistration } from "../handlers/events/prImpactHandler";
import {
    checkLibraryGoals,
    forFingerprints,
    pushImpactHandler,
} from "../handlers/events/pushImpactHandler";
import { footer } from "../support/util";

function runFingerprints(fingerprinter: FingerprintRunner): PushImpactListener<FingerprinterResult> {
    return async (i: PushImpactListenerInvocation) => {
        return fingerprinter(i.project);
    };
}

type FingerprintRunner = (p: GitProject) => Promise<FP[]>;
export type ExtractFingerprint = (p: GitProject) => Promise<FP|FP[]>;
export type ApplyFingerprint = (p: GitProject, fp: FP) => Promise<boolean>;

/**
 * different strategies can be used to handle PushImpactEventHandlers.
 */
export interface FingerprintHandler {
    selector: (name: FP) => boolean;
    diffHandler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;
    handler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;
    ballot?: (context: HandlerContext, votes: Vote[]) => Promise<any>;
}

/**
 * permits customization of EditModes in the FingerprintImpactHandlerConfig
 */
export type EditModeMaker = (cli: CommandListenerInvocation<ApplyTargetFingerprintParameters>) => editModes.EditMode;

/**
 * customize the out of the box strategy for monitoring when fingerprints are out
 * of sync with a target.
 */
export interface FingerprintImpactHandlerConfig {
    complianceGoal?: Goal;
    complianceGoalFailMessage?: string;
    transformPresentation: EditModeMaker;
    messageMaker: MessageMaker;
}

/**
 * each new class of Fingerprints must implement this interface and pass the
 */
export interface FingerprintRegistration {
    selector: (name: FP) => boolean;
    extract: ExtractFingerprint;
    apply?: ApplyFingerprint;
}

/**
 * all strategies for handler FingerprintImpact Events can configure themselves when this pack starts up
 */
export type RegisterFingerprintImpactHandler = (sdm: SoftwareDeliveryMachine, registrations: FingerprintRegistration[]) => FingerprintHandler;

/**
 * register a new Fingeprint
 *
 * @param name name of the new Fingerprint
 * @param extract function to extract the Fingerprint from a cloned code base
 * @param apply function to apply an external Fingerprint to a cloned code base
 */
export function register(name: string, extract: ExtractFingerprint, apply?: ApplyFingerprint): FingerprintRegistration {
    return {
        selector: (fp: FP) => (fp.name === name),
        extract,
        apply,
    };
}

// default implementation
export const messageMaker: MessageMaker = async params => {

    return params.ctx.messageClient.send(
        {
            attachments: [
                {
                    text: params.text,
                    color: "#45B254",
                    fallback: "Fingerprint Update",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            { text: "Update project" },
                            params.editProject,
                            {
                                msgId: params.msgId,
                                owner: params.diff.owner,
                                repo: params.diff.repo,
                                fingerprint: params.fingerprint.name,
                            }),
                        actionableButton(
                            { text: "Set New Target" },
                            params.mutateTarget,
                            {
                                msgId: params.msgId,
                                name: params.fingerprint.name,
                                sha: params.fingerprint.sha,
                            },
                        ),
                    ],
                    footer: footer(),
                },
            ],
        },
        await addressSlackChannelsFromContext(params.ctx, params.diff.channel),
        // {id: params.msgId} if you want to update messages if the target goal has not changed
        {id: undefined},
    );
};

export function fingerprintImpactHandler( config: FingerprintImpactHandlerConfig ): RegisterFingerprintImpactHandler {
    return  (sdm: SoftwareDeliveryMachine, registrations: FingerprintRegistration[]) => {
        // set goal Fingerprints
        //   - first can be added as an option when difference is noticed (uses our api to update the fingerprint)
        //   - second is a default intent
        //   - TODO:  third is just for resetting
        //   - both use askAboutBroadcast to generate an actionable message pointing at BroadcastFingerprintNudge
        sdm.addCommand(UpdateTargetFingerprint);
        sdm.addCommand(SetTargetFingerprintFromLatestMaster);
        sdm.addCommand(DeleteTargetFingerprint);

        // standard actionable message embedding ApplyTargetFingerprint
        sdm.addCommand(BroadcastFingerprintNudge);

        // this is the fingerprint editor
        sdm.addCodeTransformCommand(applyTargetFingerprint(registrations, config.transformPresentation));

        sdm.addCommand(ListFingerprints);

        return {
            selector: fp => true,
            handler: async (ctx, diff) => {
                const v: Vote = await checkFingerprintTargets(ctx, diff, config);
                return v;
            },
            ballot: votes(config),
        };
    };
}

export function checkLibraryImpactHandler(): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine) => {
        return {
            selector: forFingerprints(
                "clojure-project-deps",
                "maven-project-deps",
                "npm-project-deps"),
            handler: async (ctx, diff) => {
                return checkLibraryGoals(ctx, diff);
            },
        };
    };
}

export function checkNpmCoordinatesImpactHandler(): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine) => {

        sdm.addCommand(SetTargetFingerprint);

        return {
            selector: forFingerprints("npm-project-coordinates"),
            diffHandler: (ctx, diff) => {
                return setNewTargetFingerprint(
                    ctx,
                    getNpmDepFingerprint(diff.to.data.name, diff.to.data.version),
                    diff.channel);
            },
        };
    };
}

export function simpleImpactHandler(
    handler: (context: HandlerContext, diff: Diff) => Promise<any>,
    ...names: string[]): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine) => {
        return {
            selector: forFingerprints(...names),
            diffHandler: handler,
        };
    };
}

// TODO error handling goes here
function fingerprintRunner(fingerprinters: FingerprintRegistration[]): FingerprintRunner {
    return async (p: GitProject) => {

        let fps: FP[] = new Array<FP>();

        for (const fingerprinter of fingerprinters) {
            try {
                const fp = await fingerprinter.extract(p);
                if (fp && !(fp instanceof Array)) {
                    fps.push(fp);
                } else if (fp) {
                    fps = fps.concat(fp);
                }
            } catch (e) {
                logger.error(e);
            }
        }

        logger.info(renderData(fps));
        return fps;
    };
}

/**
 *
 *
 * @param goal use this Goal to run Fingeprints
 * @param fingerprinters registrations for each class of supported Fingerprints
 * @param handlers different strategies for handling fingeprint push impact events
 */
export function fingerprintSupport(
    goal: Fingerprint,
    fingerprinters: FingerprintRegistration[],
    ...handlers: RegisterFingerprintImpactHandler[]): ExtensionPack {

    goal.with({
        name: "fingerprinter",
        action: runFingerprints(fingerprintRunner(fingerprinters)),
    });

    return {
        ...metadata(),
        configure: (sdm: SoftwareDeliveryMachine) => {
            configure( sdm, handlers, fingerprinters);
        },
    };
}

function configure(sdm: SoftwareDeliveryMachine, handlers: RegisterFingerprintImpactHandler[], fpRegistraitons: FingerprintRegistration[]): void {

    // Fired on every Push after Fingerprints are uploaded
    sdm.addEvent(pushImpactHandler(handlers.map(h => h(sdm, fpRegistraitons))));

    // Fired on each PR after Fingerprints are uploaded
    sdm.addEvent(PullRequestImpactHandlerRegistration);

    // Deprecated
    sdm.addCommand(IgnoreVersion);
    sdm.addCodeTransformCommand(ConfirmUpdate);
    sdm.addCommand(SetTeamLibrary);
    sdm.addCodeInspectionCommand(ShowGoals);
    sdm.addCommand(ChooseTeamLibrary);
    sdm.addCommand(ClearLibraryTargets);
    sdm.addCommand(BroadcastNudge);
    sdm.addCommand(ShowTargets);
    sdm.addCommand(DumpLibraryPreferences);
    sdm.addCommand(UseLatest);
}
