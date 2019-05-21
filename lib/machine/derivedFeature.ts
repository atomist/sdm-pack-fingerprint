import {ApplyFingerprint, DerivedFeature, Feature, FingerprintSelector} from "./fingerprintSupport";
import {FP, sha256} from "../../fingerprints";

/**
 * Create a composite feature from the given other features or extractors.
 * Will use a single fingerprint that is made of many others.
 * @param featureData identifying data of new composite fingerprint
 * @param narrower function to select fingerprints from the various features that we are interested in
 * @param feature0 first feature to combine
 * @param features other features
 */
export function derivedFeature(
    featureData: Pick<Feature, "displayName" | "summary" |
        "comparators" | "tags" | "toDisplayableFingerprint" | "toDisplayableFingerprintName">,
    narrower: FingerprintSelector,
    feature0: Feature,
    ...features: Feature[]): DerivedFeature {
    const prefix = featureData.displayName + ":";
    const allFeatures = [feature0, ...features];
    const apply: ApplyFingerprint = allFeatures.some(f => !f.apply) ?
        undefined :
        async (p, fp) => {
            // fp will be our composite fingerprint
            for (const individualFingerprint of fp.data) {
                const relevantFeature = allFeatures.find(f => f.selector(individualFingerprint));
                if (!relevantFeature) {
                    throw new Error(`Internal error: We should not have a fingerprint named '${individualFingerprint.name}'\n ` +
                        "that we don't know how to apply");
                }
                await relevantFeature.apply(p, individualFingerprint);
            }
            return true;
        };
    return {
        ...featureData,
        apply,
        derive: async fps => {
            // Extract a single composite fingerprint
            return createCompositeFingerprint(prefix, fps.filter(narrower));
        },
        selector: fp => fp.name.startsWith(prefix),
    };
}

function createCompositeFingerprint(prefix: string, fingerprints: FP[]): FP {
    return fingerprints.length === 0 ?
        undefined :
        {
            name: prefix + fingerprints.map(fp => fp.name).join("&"),
            version: "0.1.0",
            abbreviation: prefix,
            sha: sha256(JSON.stringify(fingerprints)),
            data: fingerprints,
        };
}
