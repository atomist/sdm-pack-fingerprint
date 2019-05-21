import {Feature} from "./fingerprintSupport";

import * as _ from "lodash";
import {FP, sha256} from "../../fingerprints";

/**
 * Create a composite feature from the given other features or extractors.
 * Will use a single fingerprint that is made of many others.
 */
export function compositeFeature(
    featureData: Pick<Feature, "displayName" | "apply" | "summary" | "comparators" | "toDisplayableFingerprint" | "toDisplayableFingerprintName">,
    ...features: Feature[]): Feature {
    return {
        ...featureData,
        extract: async p => {
            const allFingerprints: FP[] = _.flatten(await Promise.all(features.map(f => f.extract(p))));
            return createCompositeFingerprint(allFingerprints);
        },
        selector: fp => !features.some(f => !f.selector(fp)),
    };
}

function createCompositeFingerprint(fingerprints: FP[]): FP {
    const data = fingerprints.map(fp => fp.data);
    return {
        name: fingerprints.map(fp => fp.name).join("&"),
        version: "0.1.0",
        abbreviation: fingerprints.map(fp => fp.abbreviation).join("&"),
        sha: sha256(JSON.stringify(data)),
        data,
    };
}
