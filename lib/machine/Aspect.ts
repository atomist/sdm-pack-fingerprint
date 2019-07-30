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
    HandlerContext,
    Project,
    ReviewComment,
} from "@atomist/automation-client";
import { SdmContext } from "@atomist/sdm";
import { GitCoordinate } from "../support/messages";
import { GetFpTargets } from "../typings/types";
import { Ideal } from "./Ideal";

import * as _ from "lodash";

/**
 * Fingerprint interface. An Aspect can emit zero or more fingerprints,
 * which must have the same data type.
 * @param DATA type parameter for data
 */
export interface FP<DATA = any> {
    type?: string;
    name: string;
    sha: string;
    data: DATA;
    version?: string;
    abbreviation?: string;
}

export interface Vote {
    abstain: boolean;
    decision?: string;
    name?: string;
    fingerprint?: FP;
    fpTarget?: FP;
    diff?: Diff;
    text?: string;
    summary?: { title: string, description: string };
}

/**
 * Difference between two fingerprints
 */
export interface Diff {
    from: FP;
    to: FP;
    data: {
        from: any[];
        to: any[];
    };
    owner: string;
    repo: string;
    sha: string;
    providerId: string;
    channel: string;
    branch: string;
}

/**
 * Extract fingerprint(s) from the given project.
 * Return undefined or the empty array if no fingerprints found.
 */
export type ExtractFingerprint<FPI extends FP = FP> = (p: Project) => Promise<FPI | FPI[]>;

export type FingerprintSelector = (fingerprint: FP) => boolean;

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
 * Implemented by types that know how to compare two fingerprints,
 * for example by quality or up-to-dateness
 */
export interface FingerprintComparator<FPI extends FP = FP> {
    readonly name: string;
    comparator: (a: FPI, b: FPI) => number;
}

/**
 * Common properties for all aspects.
 * Aspects add the ability to manage a particular type of fingerprint:
 * for example, helping with convergence across an organization and supporting
 * visualization. Aspects are typically extracted from a Project (see Aspect)
 * but may also be built from existing fingerprints (AtomicAspect) or derived from
 * an intermediate representation such as a ProjectAnalysis (DerivedAspect).
 * The structure (that is, the data payload) of all fingerprints emitted by an aspect
 * should be the same.
 */
export interface BaseAspect<FPI extends FP = FP> {

    /**
     * Displayable name of this aspect. Used only for reporting.
     */
    readonly displayName: string;

    /**
     * prefix for all fingerprints that are emitted by this Aspect
     */
    readonly name: string;

    /**
     * Link to documentation for this Aspect. This can help people
     * understand the results graphs and results from the analysis
     * enabled here.
     *
     * You might provide a link to the typedoc for Aspects you define,
     * or an internal page describing why you created this and what
     * people can do about their results.
     */
    readonly documentationUrl?: string;

    /**
     * Function to apply the given fingerprint instance to a project
     */
    apply?: ApplyFingerprint<FPI>;

    summary?: DiffSummaryFingerprint;

    /**
     * Functions that can be used to compare fingerprint instances managed by this
     * aspect.
     */
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

    /**
     * Validate the aspect. Return undefined or the empty array if there are no problems.
     * @return {Promise<ReviewComment[]>}
     */
    validate?(fpi: FPI): Promise<ReviewComment[]>;

    /**
     * Based on the given fingerprint type and name, suggest ideals
     * order of recommendation strength
     */
    suggestedIdeals?(type: string, fingerprintName: string): Promise<Ideal[]>;

    /**
     * Workflows to be invoked on a fingerprint change. This supports use cases such as
     * reacting to a potential impactful change and cascading changes to other projects.
     */
    workflows?: FingerprintDiffHandler[];

    /**
     * Indications about how to calculate stats for this aspect across
     * multiple projects. An aspect without AspectStats will have its entropy
     * calculated by default.
     */
    stats?: AspectStats;
}

/**
 * Type for default stats that can be calculated on any feature.
 */
export type DefaultStat = "entropy";

/**
 * Type to use to customize calculation of default stats, such as entropy.
 * By default, all default stats are calculated and exposed.
 * To disable any, set a value of false for the key (such as "entropy"). A value of true
 * continues to include the stat.
 */
export type DefaultStatStatus = Partial<Record<DefaultStat, boolean>>;

/**
 * Indication about how to calculate custom stats across multiple projects for an Aspect.
 */
export interface AspectStats {

    /**
     * Set the status for calculating and exposing default stats, such as entropy.
     * Some may be irrelevant for this aspect.
     * Default is to calculate all stats.
     */
    defaultStatStatus?: DefaultStatStatus;

    /**
     * Path inside JSON data structure to compute mean, stdev etc.
     * The value at this path must be numeric. If an aspect appears to need multiple
     * basicStatsPaths, break it up into finer grained aspects.
     */
    basicStatsPath?: string;

}

/**
 * Does this aspect support entropy, or is it turned off?
 */
export function supportsEntropy(ba: BaseAspect): boolean {
    return _.get(ba, "stats.defaultStatStatus.entropy", true) !== false;
}

/**
 * Aspect that extracts fingerprints directly from a Project.
 */
export interface Aspect<FPI extends FP = FP> extends BaseAspect<FPI> {

    /**
     * Function to extract fingerprint(s) from this project
     */
    extract: ExtractFingerprint<FPI>;

}

export interface DiffContext extends Diff {
    targets: GetFpTargets.Query;
}

export type FingerprintDiffHandler = (context: SdmContext, diff: DiffContext, aspect: Aspect) => Promise<Vote>;

/**
 * Handles differences between fingerprints across pushes and between targets.
 * Different strategies can be used to handle PushImpactEventHandlers.
 *
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
    diffHandler?: FingerprintDiffHandler;

    /**
     * Called when target fingerprint differs from current fingerprint
     * @param {HandlerContext} context
     * @param {Diff} diff
     * @return {Promise<Vote>}
     */
    handler?: FingerprintDiffHandler;

    /**
     * For collecting results on all fingerprint diff handlers
     */
    ballot?: (context: HandlerContext, votes: Vote[], coord: GitCoordinate, channel: string) => Promise<any>;
}
