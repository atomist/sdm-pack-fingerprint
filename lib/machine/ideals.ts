import {FP} from "../../fingerprints";

export interface PossibleIdeal<FPI extends FP> {
    ideal: FPI;
    reason: string;
    url?: string;
}

export interface PossibleIdeals<FPI extends FP> {

    /**
     * Ideal found from wider world--e.g. a package repository
     */
    world?: PossibleIdeal<FPI>;

    /**
     * Ideal based on what we've found internally
     */
    fromProjects?: PossibleIdeal<FPI>;

    /**
     * Ideals managed internally in an organization
     */
    custom?: Array<PossibleIdeal<FPI>>;
}
