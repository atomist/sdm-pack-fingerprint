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
    addressEvent,
    editModes,
    GraphClient,
    HandlerContext,
    logger,
    MessageClient,
    Project,
    QueryNoCacheOptions,
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
import { PushFields } from "@atomist/sdm-core/lib/typings/types";
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
    GetAllFpsOnSha,
    GetPushDetails,
} from "../typings/types";

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

type FingerprintRunner = (i: PushImpactListenerInvocation) => Promise<FP[]>;

/**
 * Extract fingerprint(s) from the given project.
 * Return undefined or the empty array if no fingerprints found.
 */
export type ExtractFingerprint<FPI extends FP = FP> = (p: Project) => Promise<FPI | FPI[]>;

export type FingerprintSelector<FPI extends FP = FP> = (fingerprint: Partial<FPI> & { name: string }) => boolean;

/**
 * Apply the given fingerprint to the project
 */
export type ApplyFingerprint<FPI extends FP = FP> = (p: Project, fp: FPI) => Promise<boolean>;

export interface DiffSummary {
    title: string;
    description: string;
}

export type DiffSummaryFingerprint = (diff: Diff, target: FP) => DiffSummary;

/**
 * Handles differences between fingerprints across pushes and between targets.
 * Different strategies can be used to handle PushImpactEventHandlers.
 */
export interface FingerprintHandler {

    /**
     * Is this handler able to manage this fingerprint instance?
     */
    selector: (name: FP) => boolean;

    /**
     * Called when shas differ across pushes
     * @param {HandlerContext} context
     * @param {Diff} diff
     * @return {Promise<Vote>}
     */
    diffHandler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;

    /**
     * Called when target fingerprint differs from current fingerprint
     * @param {HandlerContext} context
     * @param {Diff} diff
     * @return {Promise<Vote>}
     */
    handler?: (context: HandlerContext, diff: Diff) => Promise<Vote>;

    /**
     * For collecting results on all fingerprint diff handlers
     */
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

export interface RawFeature<FPI extends FP = FP> {

    /**
     * Displayable name of this feature. Used only for reporting.
     */
    readonly displayName: string;

    /**
     * Tags that can classify this feature
     */
    readonly tags?: string[];

    /**
     * Is this registration able to manage this fingerprint instance?
     */
    selector: FingerprintSelector<FPI>;

    /**
     * Function to apply the given fingerprint instance to a project
     */
    apply?: ApplyFingerprint<FPI>;

    summary?: DiffSummaryFingerprint;

    comparators?: Array<FingerprintComparator<FPI>>;

    /**
     * Convert a fingerprint value to a human readable string
     * fpi.data is a reasonable default
     */
    toDisplayableFingerprint?(fpi: FPI): string;

    /**
     * Convert a fingerprint name such as "npm-project-dep::atomist::automation-client"
     * to a human readable form such as "npm package @atomist/automation-client"
     * @param {string} fingerprintName
     * @return {string}
     */
    toDisplayableFingerprintName?(fingerprintName: string): string;

}

/**
 * Add ability to manage a particular type of fingerprint as a feature:
 * for example, helping with convergence across an organization and supporting
 * visualization.
 */
export interface Feature<FPI extends FP = FP> extends RawFeature<FPI> {

    /**
     * Function to extract fingerprint(s) from this project
     */
    extract: ExtractFingerprint<FPI>;

}

/**
 * Feature derived from existing fingerprints.
 */
export interface DerivedFeature<FPI extends FP = FP> extends RawFeature<FPI> {

    /**
     * Function to extract fingerprint(s) from this project
     */
    derive: (fps: FP[]) => Promise<FPI | FPI[]>;

}

/**
 * @deprecated use Feature
 */
export type FingerprintRegistration = Feature;

/**
 * Implemented by types that know how to compare two fingerprints,
 * for example by quality or up-to-dateness
 */
export interface FingerprintComparator<FPI extends FP = FP> {
    readonly name: string;
    comparator: (a: FPI, b: FPI) => number;
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

async function sendCustomEvent(client: MessageClient, push: PushFields.Fragment, fingerprint: any): Promise<void> {

    const customFPEvent = addressEvent("AtomistFingerprint");

    const event: any = {
        ...fingerprint,
        data: JSON.stringify(fingerprint.data),
        commitSha: push.after.sha,
    };

    try {
        await client.send(event, customFPEvent);
    } catch (e) {
        logger.error(`unable to send AtomistFingerprint ${JSON.stringify(fingerprint)}`);
    }
}

interface MissingInfo {
    providerId: string;
    channel: string;
}

async function handleDiffs(
    fp: FP,
    previous: FP,
    info: MissingInfo,
    handlers: FingerprintHandler[],
    i: PushImpactListenerInvocation): Promise<Vote[]> {

    const diff: Diff = {
        ...info,
        from: previous,
        to: fp,
        branch: i.push.branch,
        owner: i.push.repo.owner,
        repo: i.push.repo.name,
        sha: i.push.after.sha,
        data: {
            from: [],
            to: [],
        },
    };
    let diffVotes: Vote[] = new Array<Vote>();
    if (previous && fp.sha !== previous.sha) {
        diffVotes = await Promise.all(
            handlers
                .filter(h => h.diffHandler)
                .filter(h => h.selector(fp))
                .map(h => h.diffHandler(i.context, diff)));
    }
    const currentVotes: Vote[] = await Promise.all(
        handlers
            .filter(h => h.handler)
            .filter(h => h.selector(fp))
            .map(h => h.handler(i.context, diff)));

    return [].concat(
        diffVotes,
        currentVotes,
    );
}

async function lastFingerprints(sha: string, graphClient: GraphClient): Promise<Record<string, FP>> {
    // TODO what about empty queries, and missing fingerprints on previous commit
    const results: GetAllFpsOnSha.Query = await graphClient.query<GetAllFpsOnSha.Query, GetAllFpsOnSha.Variables>(
        {
            name: "GetAllFpsOnSha",
            options: QueryNoCacheOptions,
            variables: {
                sha,
            },
        },
    );
    return results.Commit[0].analysis.reduce<Record<string, FP>>(
        (record: Record<string, FP>, fp: GetAllFpsOnSha.Analysis) => {
            if (fp.name) {
                record[fp.name] = {
                    sha: fp.sha,
                    data: JSON.parse(fp.data),
                    name: fp.name,
                    version: "1.0",
                    abbreviation: "abbrev",
                };
            }
            return record;
        },
        {});
}

async function tallyVotes(vts: Vote[], handlers: FingerprintHandler[], i: PushImpactListenerInvocation, info: MissingInfo): Promise<void> {
    await Promise.all(
        handlers.map(async h => {
                if (h.ballot) {
                    await h.ballot(
                        i.context,
                        vts,
                        {
                            owner: i.push.repo.owner,
                            repo: i.push.repo.name,
                            sha: i.push.after.sha,
                            providerId: info.providerId,
                            branch: i.push.branch,
                        },
                        info.channel,
                    );
                }
            },
        ),
    );
}

async function missingInfo(i: PushImpactListenerInvocation): Promise<MissingInfo> {
    const results: GetPushDetails.Query = await i.context.graphClient.query<GetPushDetails.Query, GetPushDetails.Variables>(
        {
            name: "GetPushDetails",
            options: QueryNoCacheOptions,
            variables: {
                id: i.push.id,
            },
        });
    return {
        providerId: results.Push[0].repo.org.scmProvider.providerId,
        channel: results.Push[0].repo.channels[0].name,
    };
}

/**
 * Construct our FingerprintRunner for the current registrations
 *
 * @param fingerprinters
 */
export function fingerprintRunner(fingerprinters: Feature[], handlers: FingerprintHandler[]): FingerprintRunner {
    return async (i: PushImpactListenerInvocation) => {

        const p: Project = i.project;

        const info: MissingInfo = await missingInfo(i);
        logger.info(`Missing Info:  ${JSON.stringify(info)}`);

        let previous: Record<string, FP> = {};

        if (!!i.push.before) {
            previous = await lastFingerprints(
                i.push.before.sha,
                i.context.graphClient);
        }
        logger.info(`Found ${Object.keys(previous).length} fingerprints`);

        const allFps: FP[] = (await Promise.all(
            fingerprinters.map(
                x => x.extract(p),
            ),
        )).reduce<FP[]>(
            (acc, fps) => {
                if (fps && !(fps instanceof Array)) {
                    acc.push(fps);
                    return acc;
                } else if (fps) {
                    // TODO does concat return the larger array?
                    return acc.concat(fps);
                } else {
                    logger.warn(`extractor returned something weird ${JSON.stringify(fps)}`);
                    return acc;
                }
            },
            [],
        );

        logger.debug(renderData(allFps));

        allFps.forEach(
            async fp => {
                await sendCustomEvent(i.context.messageClient, i.push, fp);
            },
        );

        const allVotes: Vote[] = (await Promise.all(
            allFps.map(fp => handleDiffs(fp, previous[fp.name], info, handlers, i)),
        )).reduce<Vote[]>(
            (acc, vts) => acc.concat(vts),
            [],
        );
        logger.debug(`Votes:  ${renderData(allVotes)}`);
        await tallyVotes(allVotes, handlers, i, info);

        return allFps;
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
