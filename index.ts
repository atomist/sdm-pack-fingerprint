/*
 * Copyright © 2018 Atomist, Inc.
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
    fingerprintSupport,
    simpleImpactHandler,
    fingerprintImpactHandler,
    FingerprintImpactHandlerConfig,
    messageMaker,
    ApplyFingerprint,
    ExtractFingerprint,
    register,
    checkCljCoordinatesImpactHandler,
    checkNpmCoordinatesImpactHandler,
} from "./lib/machine/FingerprintSupport";
export {
    forFingerprints,
    renderDiffSnippet,
} from "./lib/handlers/events/pushImpactHandler";
export {
    MessageMaker,
} from "./lib/fingerprints/impact";
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
    applfingyDockerBaseFingerprint,
    dockerBaseFingerprint,
} from "./lib/fingerprints/dockerFrom";
export {
    diffNpmDepsFingerprints,
    applyNpmDepsFingerprint,
    createNpmDepsFingerprints,
} from "./lib/fingerprints/npmDeps";
export {
    backpackFingerprint,
    applyBackpackFingerprint,
} from "./lib/fingerprints/backpack";
