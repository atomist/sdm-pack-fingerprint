import { HandlerContext, Project, ReviewComment } from "@atomist/automation-client";
import { Diff, FP, Vote } from "@atomist/clj-editors";
import { GitCoordinate } from "../checktarget/messageMaker";
import { PossibleIdeal } from "./ideals";

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
     * Is this feature able to manage this fingerprint instance?
     */
    selector: FingerprintSelector<FPI>;

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
     * Based on the given fingerprint name and any fingerprints
     * from our organization, suggest ideals
     * @param fingerprintName name of the fingerprint we're interested in
     * order of recommendation strength
     */
    suggestedIdeals?(fingerprintName: string): Promise<Array<PossibleIdeal<FPI>>>;

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
