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
import {
    checkFingerprintTarget,
} from "../checktarget/callbacks";
import {
    IgnoreCommandRegistration,
    MessageMaker,
} from "../checktarget/messageMaker";
import {
    FP,
    Vote,
} from "../cljEditors.index";
import {
    applyTarget,
    ApplyTargetParameters,
    applyTargets,
    broadcastFingerprintMandate,
} from "../handlers/commands/applyFingerprint";
import { BroadcastFingerprintNudge } from "../handlers/commands/broadcast";
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
    SetTargetFingerprint,
    SetTargetFingerprintFromLatestMaster,
    UpdateTargetFingerprint,
} from "../handlers/commands/updateTarget";
import {
    Feature,
    FingerprintDiffHandler,
    FingerprintHandler,
} from "./Feature";
import { addFeature } from "./Features";
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
 * to configure the sdm, and they'll need all of the current active Features.
 */
export type RegisterFingerprintImpactHandler = (sdm: SoftwareDeliveryMachine, registrations: Feature[]) => FingerprintHandler;

export const DefaultTargetDiffHandler: FingerprintDiffHandler =
    async (ctx, diff, feature) => {
        const v: Vote = await checkFingerprintTarget(
            ctx.context,
            diff,
            feature,
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
    return async (context, diff, feature) => {
        if (diff.from && diff.to.sha !== diff.from.sha) {
            return handler(context, diff, feature);
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
    fingerprintGoal?: Fingerprint;

    /**
     * Optional PushImpact goal that will get configured
     */
    pushImpactGoal?: PushImpact;

    /**
     * Features we are managing
     */
    features: Feature | Feature[];

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
    return new editModes.PullRequest(
        `apply-target-fingerprint-${Date.now()}`,
        `${ci.parameters.title}`,
        `> generated by Atomist \`\`\`${ci.parameters.body}\`\`\``,
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

            const fingerprints: Feature[] = Array.isArray(options.features) ? options.features : [options.features];
            // const handlerRegistrations: RegisterFingerprintImpactHandler[]
            //     = Array.isArray(options.handlers) ? options.handlers : [options.handlers];
            // const handlers: FingerprintHandler[] = handlerRegistrations.map(h => h(sdm, fingerprints));
            const handlerRegistrations: RegisterFingerprintImpactHandler[] = [];
            const handlers: FingerprintHandler[] = [];

            fingerprints.map(addFeature);

            // tslint:disable:deprecation
            if (!!options.fingerprintGoal) {
                options.fingerprintGoal.with({
                    name: `${options.fingerprintGoal.uniqueName}-fingerprinter`,
                    action: async (i: PushImpactListenerInvocation) => {
                        await (fingerprintRunner(
                            fingerprints,
                            handlers,
                            computeFingerprints))(i);
                        return [];
                    },
                });
            }
            if (!!options.pushImpactGoal) {
                options.pushImpactGoal.withListener(fingerprintRunner(fingerprints, handlers, computeFingerprints));
            }

            configure(sdm, handlerRegistrations, fingerprints, options.transformPresentation || DefaultEditModeMaker);
        },
    };
}

function configure(
    sdm: SoftwareDeliveryMachine,
    handlers: RegisterFingerprintImpactHandler[],
    fpRegistrations: Feature[],
    editModeMaker: EditModeMaker): void {

    sdm.addCommand(ListFingerprints);
    sdm.addCommand(ListFingerprint);

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

    sdm.addCodeTransformCommand(applyTarget(sdm, fpRegistrations, editModeMaker));
    sdm.addCodeTransformCommand(applyTargets(sdm, fpRegistrations, editModeMaker));

    sdm.addCommand(broadcastFingerprintMandate(sdm, fpRegistrations));

}
