import {sha256} from "@atomist/clj-editors";
import {FP} from "../machine/Aspect";

/**
 * Convenience function to create a new fingerprint, using default strategy of
 * sha-ing stringified data.
 * Type must be supplied. Name is optional, and will default
 * to type.
 * @return {FP}
 */
export function fingerprintOf<DATA = any>(opts: {
    type: string,
    name?: string,
    data: DATA}): FP<DATA> {
    return {
        type: opts.type,
        name: opts.name || opts.type,
        data: opts.data,
        sha: sha256(JSON.stringify(opts.data)),
    };
}
