import {FP} from "../../fingerprints";
import {BaseFeature} from "./fingerprintSupport";

/**
 * Do we consider that the particular fingerprint is relevant to this project,
 * based on an intermediate format?
 */
export type RelevanceTest<SOURCE> = (fingerprintName: string, source: SOURCE) => boolean;

/**
 * Feature derived from some intermediate representation of a project
 */
export interface DerivedFeature<SOURCE, FPI extends FP = FP> extends BaseFeature<FPI> {

    /**
     * Function to extract fingerprint(s) from an intermediate representation
     * of this project
     */
    derive: (source: SOURCE) => Promise<FPI | FPI[]>;

    /**
     * Is this feature relevant to this project? For example, if
     * we are tracking TypeScript version, is this even a Node project?
     * Is the target at all relevant
     */
    relevanceTest?: RelevanceTest<SOURCE>;

    /**
     * Is this feature desired on this project, according to our standards?
     */
    necessityTest?: RelevanceTest<SOURCE>;

}
