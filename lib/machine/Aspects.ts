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

import {
    Aspect,
    FP,
} from "../..";

export function displayName(aspect: Aspect, fp: FP): string {
    if (!!aspect.toDisplayableFingerprintName) {
        return `${aspect.toDisplayableFingerprintName(fp.name)}`;
    } else {
        return `${fp.name}`;
    }
}

export function displayValue(aspect: Aspect, fp: FP): string {
    if (!!aspect.toDisplayableFingerprint) {
        return `${aspect.toDisplayableFingerprint(fp)}`;
    } else {
        return `${fp.data}`;
    }
}

const aspects = new Map<string, Aspect>();

export function addAspect(aspect: Aspect): void {
    aspects.set(aspect.name, aspect);
}

export function applyToAspect<T>(fp: FP, f: (aspect: Aspect, fp: FP) => T): T {
    if (!aspects.get(fp.type || fp.name)) {
        throw new Error(`can not lookup Aspect for ${fp.type}::${fp.name}`);
    }
    return f(aspects.get(fp.type), fp);
}
