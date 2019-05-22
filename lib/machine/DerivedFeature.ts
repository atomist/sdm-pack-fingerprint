import {FP} from "../../fingerprints";
import {BaseFeature} from "./fingerprintSupport";

/**
 * Feature derived from some intermediate representation of a project
 */
export interface DerivedFeature<SOURCE, FPI extends FP = FP> extends BaseFeature<FPI> {

    /**
     * Function to extract fingerprint(s) from an intermediate representation
     * of this project
     */
    derive: (source: SOURCE) => Promise<FPI | FPI[]>;

}