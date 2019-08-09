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

import { sha256 } from "@atomist/clj-editors";
import {
    ApplyFingerprint,
    Aspect,
    BaseAspect,
    FingerprintSelector,
    FP,
} from "./Aspect";
import { aspectOf } from "./Aspects";

/**
 * Aspect derived from existing fingerprints.
 * Surfaces as a single fingerprint. Implementations must
 * also support atomic application.
 */
export interface AtomicAspect<FPI extends FP = FP> extends BaseAspect<FPI> {

    /**
     * Function to extract fingerprint(s) from this project
     */
    consolidate: (fps: FP[]) => Promise<FPI>;

}

export function isAtomicAspect(aspect: BaseAspect): aspect is AtomicAspect {
    const maybe = aspect as AtomicAspect;
    return !!maybe.consolidate;
}

/**
 * Create a composite aspect from the given other aspects or extractors.
 * Will use a single fingerprint that is made of many others. Ordering is significant:
 * atomic aspects can only be computed after normal fingerprints have been calculated.
 * @param aspectData identifying data of new composite fingerprint
 * @param narrower function to select fingerprints from the various aspects that we are interested in
 * @param aspect0 first aspect to combine
 * @param aspects other aspects
 */
export function atomicAspect(
    aspectData: Pick<Aspect, "displayName" | "summary" |
        "comparators" | "toDisplayableFingerprint" | "toDisplayableFingerprintName" | "name">,
    narrower: FingerprintSelector,
    aspect0: Aspect,
    ...aspects: Aspect[]): AtomicAspect {
    const prefix = aspectData.displayName + ":";
    const allAspects = [aspect0, ...aspects];
    const apply: ApplyFingerprint = allAspects.some(f => !f.apply) ?
        undefined :
        applyAll(allAspects, narrower);
    return {
        ...aspectData,
        apply,
        consolidate: async fps => {
            // Extract a single composite fingerprint
            return createCompositeFingerprint(prefix, fps.filter(narrower));
        },
    };
}

function createCompositeFingerprint(prefix: string, fingerprints: FP[]): FP {
    return fingerprints.length === 0 ?
        undefined :
        {
            type: prefix + fingerprints.map(fp => fp.type).join("&"),
            name: prefix + fingerprints.map(fp => fp.name).join("&"),
            version: "0.1.0",
            abbreviation: prefix,
            sha: sha256(JSON.stringify(fingerprints)),
            data: fingerprints,
        };
}

function applyAll(aspects: Aspect[], narrower: FingerprintSelector): ApplyFingerprint {
    return async (p, fp) => {

        for (const individualFingerprint of fp.data) {
            const aspect = aspectOf(individualFingerprint, aspects);
            if (!!aspect && !!aspect.apply) {
                const result = await aspect.apply(p, individualFingerprint);
                if (!result) {
                    return result;
                }
            }
        }
        return true;
    };
}
