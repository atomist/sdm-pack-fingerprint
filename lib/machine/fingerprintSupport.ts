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
    Project,
} from "@atomist/automation-client";
import {
    AutoMergeMethod,
    AutoMergeMode,
} from "@atomist/automation-client/lib/operations/edit/editModes";
import {
    ExtensionPack,
    Fingerprint,
    Goal,
    metadata,
    PushAwareParametersInvocation,
    PushImpact,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import {
    checkFingerprintTarget,
} from "../checktarget/callbacks";
import {
    IgnoreCommandRegistration,
    messageMaker,
    MessageMaker,
} from "../checktarget/messageMaker";
import {
    applyTarget,
    ApplyTargetParameters,
    applyTargets,
    broadcastFingerprintMandate,
} from "../handlers/commands/applyFingerprint";
import { BroadcastFingerprintNudge } from "../handlers/commands/broadcast";
import { FingerprintMenu } from "../handlers/commands/fingerprints";
import {
    listFingerprint,
    listFingerprints,
} from "../handlers/commands/list";
import {
    listFingerprintTargets,
    listOneFingerprintTarget,
} from "../handlers/commands/showTargets";
import {
    deleteTargetFingerprint,
    selectTargetFingerprintFromCurrentProject,
    SetTargetFingerprint,
    setTargetFingerprintFromLatestMaster,
    UpdateTargetFingerprint,
} from "../handlers/commands/updateTarget";
import {
    Aspect,
    FingerprintDiffHandler,
    FingerprintHandler,
    FP,
    Vote,
} from "./Aspect";
import { addAspect } from "./Aspects";
import {
    computeFingerprints,
    fingerprintRunner,
} from "./runner";

export function forFingerprints(...s: string[]): (fp: FP) => boolean {
    return fp => {
        return s.map(n => (fp.type === n) || (fp.name === n))
            .reduce((acc, v) => acc || v);
    };
}

/**
 * permits customization of EditModes in the FingerprintImpactHandlerConfig
 */
export type EditModeMaker = (cli: PushAwareParametersInvocation<ApplyTargetParameters>, project?: Project) => editModes.EditMode;

/**
 * customize the out of the box strategy for monitoring when fingerprints are out
 * of sync with a target.
 *
 */
export interface FingerprintImpactHandlerConfig {
    complianceGoal?: Goal;
    complianceGoalFailMessage?: string;
    transformPresentation: EditModeMaker;
    messageMaker: MessageMaker;
}

/**
 * Setting up a PushImpactHandler to handle different strategies (FingerprintHandlers) involves giving them the opportunity
 * to configure the sdm, and they'll need all of the current active Aspects.
 */
export type RegisterFingerprintImpactHandler = (sdm: SoftwareDeliveryMachine, registrations: Aspect[]) => FingerprintHandler;

export const DefaultTargetDiffHandler: FingerprintDiffHandler =
    async (ctx, diff, aspect) => {
        const v: Vote = await checkFingerprintTarget(
            ctx.context,
            diff,
            aspect,
            async () => {
                return diff.targets;
            },
        );
        return v;
    };

/**
 * wrap a FingerprintDiffHandler to only check if the shas have changed
 *
 * @param handler the FingerprintDiffHandler to wrap
 */
export function diffOnlyHandler(handler: FingerprintDiffHandler): FingerprintDiffHandler {
    return async (context, diff, aspect) => {
        if (diff.from && diff.to.sha !== diff.from.sha) {
            return handler(context, diff, aspect);
        } else {
            return {
                abstain: true,
            };
        }
    };
}

/**
 * Options to configure the Fingerprint support
 */
export interface FingerprintOptions {

    /**
     * Optional Fingerprint goal that will get configured.
     * If not provided fingerprints need to be registered manually with the goal.
     * @deprecated use pushImpactGoal instead
     */
    // tslint:disable:deprecation
    fingerprintGoal?: Fingerprint;

    /**
     * Optional PushImpact goal that will get configured
     */
    pushImpactGoal?: PushImpact;

    /**
     * Aspects we are managing
     */
    aspects: Aspect | Aspect[];

    /**
     * Register FingerprintHandler factories to handle fingerprint impacts
     * @deprecated embed handlers in Features
     */
    handlers?: RegisterFingerprintImpactHandler | RegisterFingerprintImpactHandler[];

    transformPresentation?: EditModeMaker;
}

export const DefaultEditModeMaker: EditModeMaker = (ci, p) => {
    // name the branch apply-target-fingerprint with a Date
    // title can be derived from ApplyTargetParameters
    // body can be derived from ApplyTargetParameters
    // optional message is undefined here
    // target branch is hard-coded to master

    const fingerprint = ci.parameters.fingerprint || ci.parameters.targetfingerprint;

    return new editModes.PullRequest(
        `apply-target-fingerprint-${Date.now()}`,
        ci.parameters.title,
        `${ci.parameters.body}

[atomist:generated]${!!fingerprint ? ` [fingerprint:${fingerprint}` : ""}`,
        undefined,
        ci.parameters.branch || "master",
        {
            method: AutoMergeMethod.Squash,
            mode: AutoMergeMode.ApprovedReview,
        });
};

/**
 * Install and configure the fingerprint support in this SDM
 */
export function fingerprintSupport(options: FingerprintOptions): ExtensionPack {

    return {
        ...metadata(),
        configure: (sdm: SoftwareDeliveryMachine) => {

            const fingerprints: Aspect[] = toArray(options.aspects);
            // const handlerRegistrations: RegisterFingerprintImpactHandler[]
            //     = Array.isArray(options.handlers) ? options.handlers : [options.handlers];
            // const handlers: FingerprintHandler[] = handlerRegistrations.map(h => h(sdm, fingerprints));
            const handlerRegistrations: RegisterFingerprintImpactHandler[] = [];
            const handlers: FingerprintHandler[] = [];

            fingerprints.map(addAspect);

            const runner = fingerprintRunner(
                fingerprints,
                handlers,
                computeFingerprints,
                {
                    messageMaker,
                    transformPresentation: DefaultEditModeMaker,
                    ...options,
                });

            // tslint:disable:deprecation
            if (!!options.fingerprintGoal) {
                options.fingerprintGoal.with({
                    name: `${options.fingerprintGoal.uniqueName}-fingerprinter`,
                    action: async (i: PushImpactListenerInvocation) => {
                        await runner(i);
                        return [];
                    },
                });
            }
            if (!!options.pushImpactGoal) {
                options.pushImpactGoal.withListener(runner);
            }

            configure(sdm, handlerRegistrations, fingerprints, options.transformPresentation || DefaultEditModeMaker);
        },
    };
}

function configure(
    sdm: SoftwareDeliveryMachine,
    handlers: RegisterFingerprintImpactHandler[],
    fpRegistrations: Aspect[],
    editModeMaker: EditModeMaker): void {

    sdm.addCommand(listFingerprints(sdm));
    sdm.addCommand(listFingerprint(sdm));

    // set a target given using the entire JSON fingerprint payload in a parameter
    sdm.addCommand(SetTargetFingerprint);
    // set a different target after noticing that a fingerprint is different from current target
    sdm.addCommand(UpdateTargetFingerprint);
    // Bootstrap a fingerprint target by selecting one from current project
    sdm.addCommand(selectTargetFingerprintFromCurrentProject(sdm));
    // Bootstrap a fingerprint target from project by name
    sdm.addCommand(setTargetFingerprintFromLatestMaster(sdm));
    sdm.addCommand(deleteTargetFingerprint(sdm));

    // standard actionable message embedding ApplyTargetFingerprint
    sdm.addCommand(BroadcastFingerprintNudge);

    sdm.addCommand(IgnoreCommandRegistration);

    sdm.addCommand(listFingerprintTargets(sdm));
    sdm.addCommand(listOneFingerprintTarget(sdm));

    sdm.addCommand(FingerprintMenu);

    sdm.addCodeTransformCommand(applyTarget(sdm, fpRegistrations, editModeMaker));
    sdm.addCodeTransformCommand(applyTargets(sdm, fpRegistrations, editModeMaker));

    sdm.addCommand(broadcastFingerprintMandate(sdm, fpRegistrations));

}
