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

export {
    BaseFeature,
    fingerprintSupport,
    forFingerprints,
    simpleImpactHandler,
    fingerprintImpactHandler,
    FingerprintImpactHandlerConfig,
    ApplyFingerprint,
    ExtractFingerprint,
    checkNpmCoordinatesImpactHandler,
    fingerprintRunner,
    runFingerprints,
    Feature,
    FingerprintRegistration,
} from "./lib/machine/fingerprintSupport";
export {
    renderDiffSnippet,
} from "./lib/support/util";
export {
    MessageMaker,
    messageMaker,
} from "./lib/checktarget/messageMaker";
export {
    Diff,
    FP,
    depsFingerprints,
    logbackFingerprints,
    cljFunctionFingerprints,
    renderClojureProjectDiff,
    renderData,
    applyFingerprint,
    renderDiff,
    sha256,
} from "./fingerprints";
export {
    applyDockerBaseFingerprint,
    dockerBaseFingerprint,
    DockerFrom,
    getDockerBaseFingerprint,
} from "./lib/fingerprints/dockerFrom";
export {
    constructNpmDepsFingerprintName,
    deconstructNpmDepsFingerprintName,
    diffNpmDepsFingerprints,
    applyNpmDepsFingerprint,
    createNpmDepsFingerprints,
    NpmDeps,
} from "./lib/fingerprints/npmDeps";
export {
    backpackFingerprint,
    applyBackpackFingerprint,
    Backpack,
} from "./lib/fingerprints/backpack";
export {
    CljFunctions,
    LeinMavenDeps,
    Logback,
} from "./lib/fingerprints/clojure";

export * from "./lib/machine/AtomicFeature";
export * from "./lib/machine/DerivedFeature";

export * from "./lib/machine/ideals";
