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
    HandlerContext,
    logger,
    Project,
} from "@atomist/automation-client";
import {
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
import _ = require("lodash");
import {
    Diff,
    FP,
    renderData,
    Vote,
} from "../../fingerprints/index";
import {
    checkFingerprintTarget,
    votes,
} from "../checktarget/callbacks";
import {
    GitCoordinate,
    IgnoreCommandRegistration,
    MessageMaker,
} from "../checktarget/messageMaker";
import { getNpmDepFingerprint } from "../fingerprints/npmDeps";
import {
    applyTarget,
    ApplyTargetParameters,
    applyTargets,
    broadcastFingerprintMandate,
} from "../handlers/commands/applyFingerprint";
import { BroadcastFingerprintNudge } from "../handlers/commands/broadcast";
import {
    FingerprintEverything,
} from "../handlers/commands/fingerprint";
import {
    ListFingerprint,
    ListFingerprints,
} from "../handlers/commands/list";
import {
    DumpLibraryPreferences,
    listFingerprintTargets,
    listOneFingerprintTarget,
} from "../handlers/commands/showTargets";
import {
    DeleteTargetFingerprint,
    SelectTargetFingerprintFromCurrentProject,
    setNewTargetFingerprint,
    SetTargetFingerprint,
    SetTargetFingerprintFromLatestMaster,
    UpdateTargetFingerprint,
} from "../handlers/commands/updateTarget";
import {
    forFingerprints,
    pushImpactHandler,
} from "../handlers/events/pushImpactHandler";

/**
 * Wrap a FingerprintRunner in a PushImpactListener so we can embed this in an  SDMGoal
 *
 * @param fingerprinter
 */
export function runFingerprints(fingerprinter: FingerprintRunner): PushImpactListener<FingerprinterResult> {
    return async (i: PushImpactListenerInvocation) => {
        return fingerprinter(i.project);
    };
}

type FingerprintRunner = (p: GitProject) => Promise<FP[]>;
export type ExtractFingerprint = (p: GitProject) => Promise<FP | FP[]>;
export type ApplyFingerprint = (p: GitProject, fp: FP) => Promise<boolean>;

export interface DiffSummary {
    title: string;
    description: string;
}

export type DiffSummaryFingerprint = (diff: Diff, target: FP) => DiffSummary;

/**
 * different strategies can be used to handle PushImpactEventHandlers.
 */
export interface FingerprintHandler {
    selector: (name: FP) => boolean;
    diffHandler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;
    handler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;
    ballot?: (context: HandlerContext, votes: Vote[], coord: GitCoordinate, channel: string) => Promise<any>;
}

/**
 * permits customization of EditModes in the FingerprintImpactHandlerConfig
 */
export type EditModeMaker = (cli: CommandListenerInvocation<ApplyTargetParameters>, project?: Project) => editModes.EditMode;

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
    summary?: DiffSummaryFingerprint;
}

/**
 * Setting up a PushImpactHandler to handle different strategies (FingerprintHandlers) involves giving them the opportunity
 * to configure the sdm, and they'll need all of the current active FingerprintRegistrations.
 */
export type RegisterFingerprintImpactHandler = (sdm: SoftwareDeliveryMachine, registrations: FingerprintRegistration[]) => FingerprintHandler;

/**
 * convenient function to register a create a FingerprintRegistration
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

function checkScope(fp: FP, registrations: FingerprintRegistration[]): boolean {
    const inScope: boolean = _.some(registrations, reg => reg.selector(fp));
    logger.info(`checked scope for ${fp.name} => ${inScope}`);
    return inScope;
}

/**
 * This configures the registration function for the "target fingerprint" FingerprintHandler.  It's an important one
 * because it's the one that generates messages when fingerprints don't line up with their "target" values.  It does
 * nothing when there's no target set for a workspace.
 *
 * @param config
 */
export function fingerprintImpactHandler(config: FingerprintImpactHandlerConfig): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine, registrations: FingerprintRegistration[]) => {
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

        sdm.addCommand(ListFingerprints);
        sdm.addCommand(ListFingerprint);
        sdm.addCommand(SelectTargetFingerprintFromCurrentProject);
        sdm.addCommand(IgnoreCommandRegistration);

        sdm.addCodeTransformCommand(applyTarget(sdm, registrations, config.transformPresentation));
        sdm.addCodeTransformCommand(applyTargets(sdm, registrations, config.transformPresentation));

        sdm.addCommand(broadcastFingerprintMandate(sdm, registrations));

        return {
            selector: fp => checkScope(fp, registrations),
            handler: async (ctx, diff) => {
                const v: Vote = await checkFingerprintTarget(ctx, diff, config, registrations);
                return v;
            },
            ballot: votes(config),
        };
    };
}

/**
 * This creates the registration function for a handler that notices that a project.clj file version
 * has been updated.
 */
export function checkCljCoordinatesImpactHandler(): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine) => {

        return {
            selector: forFingerprints("clojure-project-coordinates"),
            diffHandler: (ctx, diff) => {
                return setNewTargetFingerprint(
                    ctx,
                    getNpmDepFingerprint(diff.to.data.name, diff.to.data.version),
                    diff.channel);
            },
        };
    };
}

/**
 * This creates the registration function for a handler that notices that a package.json version
 * has been updated.
 */
export function checkNpmCoordinatesImpactHandler(): RegisterFingerprintImpactHandler {
    return (sdm: SoftwareDeliveryMachine) => {

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

/**
 * Utility for creating a registration function for a handler that will just invoke the supplied callback
 * if one of the suppled fingerprints changes
 *
 * @param handler callback
 * @param names set of fingerprint names that should trigger the callback
 */
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

/**
 * Construct our FingerprintRunner for the current registrations
 *
 * @param fingerprinters
 */
export function fingerprintRunner(fingerprinters: FingerprintRegistration[]): FingerprintRunner {
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
 * Options to configure the Fingerprint support
 */
export interface FingerprintOptions {
    /**
     * Optional Fingerprint goal that will get configured.
     * If not provided fingerprints need to be registered manually with the goal.
     */
    fingerprintGoal?: Fingerprint;

    /**
     * Registrations for desired fingerprints
     */
    fingerprints: FingerprintRegistration | FingerprintRegistration[];

    /**
     * Register FingerprintHandler factories to handle fingerprint impacts
     */
    handlers: RegisterFingerprintImpactHandler | RegisterFingerprintImpactHandler[];
}

/**
 * Install and configure the fingerprint support in this SDM
 */
export function fingerprintSupport(options: FingerprintOptions): ExtensionPack {
    return {
        ...metadata(),
        configure: (sdm: SoftwareDeliveryMachine) => {

            const fingerprints = Array.isArray(options.fingerprints) ? options.fingerprints : [options.fingerprints];
            const handlers = Array.isArray(options.handlers) ? options.handlers : [options.handlers];

            if (!!options.fingerprintGoal) {
                options.fingerprintGoal.with({
                    name: `${options.fingerprintGoal.uniqueName}-fingerprinter`,
                    action: runFingerprints(fingerprintRunner(fingerprints)),
                });
            }

            configure(sdm, handlers, fingerprints);
        },
    };
}

function configure(sdm: SoftwareDeliveryMachine,
                   handlers: RegisterFingerprintImpactHandler[],
                   fpRegistraitons: FingerprintRegistration[]): void {

    // Fired on every Push after Fingerprints are uploaded
    sdm.addEvent(pushImpactHandler(handlers.map(h => h(sdm, fpRegistraitons))));

    sdm.addCommand(SetTargetFingerprint);
    sdm.addCommand(DumpLibraryPreferences);
    sdm.addCommand(listFingerprintTargets(sdm));
    sdm.addCommand(listOneFingerprintTarget(sdm));
    sdm.addCommand(FingerprintEverything);
}
