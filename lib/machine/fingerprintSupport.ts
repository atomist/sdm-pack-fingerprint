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

import { Project } from "@atomist/automation-client";
import {
    AutoMerge,
    AutoMergeMethod,
    AutoMergeMode,
} from "@atomist/automation-client/lib/operations/edit/editModes";
import {
    ExtensionPack,
    Fingerprint,
    formatDate,
    Goal,
    metadata,
    PushImpact,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
    TransformPresentation,
} from "@atomist/sdm";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import * as _ from "lodash";
import { checkFingerprintTarget } from "../checktarget/callbacks";
import {
    ignoreCommand,
    messageMaker,
    MessageMaker,
} from "../checktarget/messageMaker";
import {
    applyTarget,
    applyTargetBySha,
    ApplyTargetParameters,
    applyTargets,
    broadcastFingerprintMandate,
} from "../handlers/commands/applyFingerprint";
import { broadcastFingerprintNudge } from "../handlers/commands/broadcast";
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
    setTargetFingerprint,
    setTargetFingerprintFromLatestMaster,
    updateTargetFingerprint,
} from "../handlers/commands/updateTarget";
import {
    Aspect,
    FingerprintDiffHandler,
    FingerprintHandler,
    FP,
    Vote,
} from "./Aspect";
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
 * customize the out of the box strategy for monitoring when fingerprints are out
 * of sync with a target.
 *
 */
export interface FingerprintImpactHandlerConfig {
    complianceGoal?: Goal;
    complianceGoalFailMessage?: string;
    transformPresentation: TransformPresentation<ApplyTargetParameters>;
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

    transformPresentation?: TransformPresentation<ApplyTargetParameters>;
}

export const DefaultTransformPresentation: TransformPresentation<ApplyTargetParameters> = createPullRequestTransformPresentation();

/**
 * Options to configure the PullRequest creation
 */
export interface PullRequestTransformPresentationOptions {
    branchPrefix?: string;
    title?: string;
    body?: string;
    message?: string;
    autoMerge?: {
        method?: AutoMergeMethod;
        mode?: AutoMergeMode;
    };
}

/**
 * Creates the default TransformPresentation for raising PullRequests
 */
export function createPullRequestTransformPresentation(options: PullRequestTransformPresentationOptions = {})
    : TransformPresentation<ApplyTargetParameters> {
    return (ci, p) => new LazyPullRequest(options, ci.parameters, p);
}

/**
 * Lazy implementation of PullRequest to defer creation of title and body etc to when they
 * are actually needed
 *
 * This allows us to better format the properties of the PullRequest as we have access to the
 * parameters instance.
 */
class LazyPullRequest {

    private readonly fingerprint: string;

    private readonly branchName: string;

    constructor(private readonly options: PullRequestTransformPresentationOptions,
                private readonly parameters: ApplyTargetParameters,
                private readonly project: Project) {

        this.fingerprint = (this.parameters.fingerprint || this.parameters.targetfingerprint || this.parameters.type) as string;
        if (!this.fingerprint) {
            this.fingerprint = this.parameters.fingerprints as string;
            if (!!this.fingerprint) {
                this.fingerprint = this.fingerprint.split(",").map(f => f.trim()).join(", ");
            }
        }
        this.branchName = `${this.options.branchPrefix || "apply-target-fingerprint"}-${formatDate()}`;
    }

    get branch(): string {
        return this.branchName;
    }

    get title(): string {
        return this.options.title || this.parameters.title || `Apply target fingerprint (${this.fingerprint})`;
    }

    get body(): string {
         return `${this.options.body || this.parameters.body || this.title}\n\n[atomist:generated]`;
    }
    get message(): string {
        return this.options.message || this.title;
    }
    get targetBranch(): string {
        return this.project.id.branch;
    }
    get autoMerge(): AutoMerge {
        const autoMerge = _.get(this.options, "autoMerge") || {};
        return {
            method: autoMerge.method || AutoMergeMethod.Squash,
            mode: autoMerge.mode || AutoMergeMode.ApprovedReview,
        };
    }
}

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

            const runner = fingerprintRunner(
                fingerprints,
                handlers,
                computeFingerprints,
                {
                    messageMaker,
                    transformPresentation: DefaultTransformPresentation,
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

            configure(sdm, handlerRegistrations, fingerprints, options.transformPresentation || DefaultTransformPresentation);
        },
    };
}

function configure(
    sdm: SoftwareDeliveryMachine,
    handlers: RegisterFingerprintImpactHandler[],
    aspects: Aspect[],
    editModeMaker: TransformPresentation<ApplyTargetParameters>): void {

    sdm.addCommand(listFingerprints(sdm));
    sdm.addCommand(listFingerprint(sdm));

    // set a target given using the entire JSON fingerprint payload in a parameter
    sdm.addCommand(setTargetFingerprint(aspects));
    // set a different target after noticing that a fingerprint is different from current target
    sdm.addCommand(updateTargetFingerprint(sdm, aspects));
    // Bootstrap a fingerprint target by selecting one from current project
    sdm.addCommand(selectTargetFingerprintFromCurrentProject(sdm));
    // Bootstrap a fingerprint target from project by name
    sdm.addCommand(setTargetFingerprintFromLatestMaster(sdm, aspects));
    sdm.addCommand(deleteTargetFingerprint(sdm));

    // standard actionable message embedding ApplyTargetFingerprint
    sdm.addCommand(broadcastFingerprintNudge(aspects));

    sdm.addCommand(ignoreCommand(aspects));

    sdm.addCommand(listFingerprintTargets(sdm));
    sdm.addCommand(listOneFingerprintTarget(sdm));

    sdm.addCommand(FingerprintMenu);

    sdm.addCodeTransformCommand(applyTarget(sdm, aspects, editModeMaker));
    sdm.addCodeTransformCommand(applyTargets(sdm, aspects, editModeMaker));
    sdm.addCodeTransformCommand(applyTargetBySha(sdm, aspects, editModeMaker));

    sdm.addCommand(broadcastFingerprintMandate(sdm, aspects));

}
