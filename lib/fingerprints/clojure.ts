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
    applyFingerprint,
    cljFunctionFingerprints,
    depsFingerprints,
    logbackFingerprints,
    renderClojureProjectDiff,
} from "../../fingerprints";
import { FingerprintRegistration } from "../machine/fingerprintSupport";

export const Logback: FingerprintRegistration = {
    extract: p => logbackFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => fp.name === "elk-logback",
};

export const LeinMavenDeps: FingerprintRegistration = {
    extract: p => depsFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => {
        return fp.name.startsWith("maven-project") || fp.name.startsWith("clojure-project");
    },
    summary: renderClojureProjectDiff,
};

export const CljFunctions: FingerprintRegistration = {
    extract: p => cljFunctionFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => fp.name.startsWith("public-defn-bodies"),
};
