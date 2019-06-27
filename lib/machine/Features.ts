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
