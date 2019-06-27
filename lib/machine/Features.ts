import { Feature, FP } from "../..";

export function displayName(feature: Feature, fp: FP): string {
    if (!!feature.toDisplayableFingerprintName) {
        return `${feature.toDisplayableFingerprintName(fp.name)}`;
    } else {
        return `${fp.name}`;
    }
}

export function displayValue(feature: Feature, fp: FP): string {
    if (!!feature.toDisplayableFingerprint) {
        return `${feature.toDisplayableFingerprint(fp)}`;
    } else {
        return `${fp.data}`;
    }
}

const features = new Map<string, Feature>();

export function addFeature(feature: Feature): void {
    features.set(feature.name, feature);
}

export function applyToFeature<T>(fp: FP, f: (feature: Feature, fp: FP) => T): T {
    if (!features.get(fp.type)) {
        throw new Error(`can not lookup Feature for ${fp.type}::${fp.name}`);
    }
    return f(features.get(fp.type), fp);
}
