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
    HandlerContext,
    Project,
} from "@atomist/automation-client";
import {
    Diff,
    FP,
    Vote,
} from "@atomist/clj-editors";
import {
    ExtensionPack,
    Fingerprint,
    FingerprinterResult,
    Goal,
    metadata,
    PushImpactListener,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
    PushAwareParametersInvocation,
} from "@atomist/sdm";
import _ = require("lodash");
import {
    checkFingerprintTarget,
    votes,
} from "../checktarget/callbacks";
import {
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
    Feature,
    FingerprintHandler,
} from "./Feature";
import {
    fingerprintRunner,
    FingerprintRunner,
} from "./runner";

export function forFingerprints(...s: string[]): (fp: FP) => boolean {
    return fp => {
        const m = s.map((n: string) => (fp.name === n))
            .reduce((acc, v) => acc || v);
        return m;
    };
}

/**
 * Wrap a FingerprintRunner in a PushImpactListener so we can embed this in an  SDMGoal
 *
 * @param fingerprinter
 */
export function runFingerprints(fingerprinter: FingerprintRunner): PushImpactListener<FingerprinterResult> {
    return async (i: PushImpactListenerInvocation) => {
        return fingerprinter(i);
    };
}

/**
 * permits customization of EditModes in the FingerprintImpactHandlerConfig
 */
export type EditModeMaker = (cli: PushAwareParametersInvocation<ApplyTargetParameters>, project?: Project) => editModes.EditMode;

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
 * Setting up a PushImpactHandler to handle different strategies (FingerprintHandlers) involves giving them the opportunity
 * to configure the sdm, and they'll need all of the current active Features.
 */
export type RegisterFingerprintImpactHandler = (sdm: SoftwareDeliveryMachine, registrations: Feature[]) => FingerprintHandler;

function checkScope(fp: FP, registrations: Feature[]): boolean {
    const inScope: boolean = _.some(registrations, reg => reg.selector(fp));
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
    return (sdm: SoftwareDeliveryMachine, registrations: Feature[]) => {
        // set goal Fingerprints
        //   - first can be added as an option when difference is noticed (uses our api to update the fingerprint)
        //   - second is a default intent
        //   - TODO:  third is just for resetting
        //   - both use askAboutBroadcast to generate an actionable message pointing at BroadcastFingerprintNudge

        // set a target given using the entire JSON fingerprint payload in a parameter
        sdm.addCommand(SetTargetFingerprint);
        // set a different target after noticing that a fingerprint is different from current target
        sdm.addCommand(UpdateTargetFingerprint);
        // Bootstrap a fingerprint target by selecting one from current project
        sdm.addCommand(SelectTargetFingerprintFromCurrentProject);
        // Bootstrap a fingerprint target from project by name
        sdm.addCommand(SetTargetFingerprintFromLatestMaster);
        sdm.addCommand(DeleteTargetFingerprint);

        // standard actionable message embedding ApplyTargetFingerprint
        sdm.addCommand(BroadcastFingerprintNudge);

        sdm.addCommand(IgnoreCommandRegistration);

        sdm.addCommand(listFingerprintTargets(sdm));
        sdm.addCommand(listOneFingerprintTarget(sdm));

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
 * Options to configure the Fingerprint support
 */
export interface FingerprintOptions {

    /**
     * Optional Fingerprint goal that will get configured.
     * If not provided fingerprints need to be registered manually with the goal.
     */
    fingerprintGoal?: Fingerprint;

    /**
     * Features we are managing
     */
    features: Feature | Feature[];

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

            const fingerprints = Array.isArray(options.features) ? options.features : [options.features];
            const handlers = Array.isArray(options.handlers) ? options.handlers : [options.handlers];

            // TODO we can consider switching this to a regular Fulfillable Goal when the action no longer has
            //      to return a Fingerprints
            if (!!options.fingerprintGoal) {
                options.fingerprintGoal.with({
                    name: `${options.fingerprintGoal.uniqueName}-fingerprinter`,
                    action: runFingerprints(fingerprintRunner(fingerprints, handlers.map(h => h(sdm, fingerprints)))),
                });
            }

            configure(sdm, handlers, fingerprints);
        },
    };
}

function configure(sdm: SoftwareDeliveryMachine,
    handlers: RegisterFingerprintImpactHandler[],
    fpRegistraitons: Feature[]): void {

    sdm.addCommand(ListFingerprints);
    sdm.addCommand(ListFingerprint);
    sdm.addCommand(FingerprintEverything);
}
