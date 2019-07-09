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
import { Diff,
    FP,
    Vote} from "../cljEditors.index";
import { GitCoordinate } from "../support/messages";
import { GetFpTargets } from "../typings/types";
import { Ideal } from "./Ideal";

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
 * Common properties for all features.
 * Features add the ability to manage a particular type of fingerprint:
 * for example, helping with convergence across an organization and supporting
 * visualization. Features are typically extracted from a Project (see Feature)
 * but may also be built from existing fingerprints (AtomicFeature) or derived from
 * an intermediate representation such as a ProjectAnalysis (DerivedFeature).
 */
export interface BaseFeature<FPI extends FP = FP> {

    /**
     * Displayable name of this feature. Used only for reporting.
     */
    readonly displayName: string;

    /**
     * prefix for all fingerprints that are emitted by this Feature
     */
    readonly name: string;

    /**
     * Function to apply the given fingerprint instance to a project
     */
    apply?: ApplyFingerprint<FPI>;

    summary?: DiffSummaryFingerprint;

    /**
     * Functions that can be used to compare fingerprint instances managed by this
     * feature.
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
     * Validate the feature. Return undefined or the empty array if there are no problems.
     * @return {Promise<ReviewComment[]>}
     */
    validate?(fpi: FPI): Promise<ReviewComment[]>;

    /**
     * Based on the given fingerprint type and name, suggest ideals
     * order of recommendation strength
     */
    suggestedIdeals?(type: string, fingerprintName: string): Promise<Ideal[]>;

    workflows?: FingerprintDiffHandler[];
}

/**
 * Feature that extracts fingerprints directly from a Project.
 */
export interface Feature<FPI extends FP = FP> extends BaseFeature<FPI> {

    /**
     * Function to extract fingerprint(s) from this project
     */
    extract: ExtractFingerprint<FPI>;

}

/**
 * @deprecated use Feature
 */
export type FingerprintRegistration = Feature;

export interface DiffContext extends Diff {
    targets: GetFpTargets.Query;
}

export type FingerprintDiffHandler = (context: SdmContext, diff: DiffContext, feature: Feature) => Promise<Vote>;

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
