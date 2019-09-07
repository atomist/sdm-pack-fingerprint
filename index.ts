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
    createPullRequestTransformPresentation,
    fingerprintSupport,
    forFingerprints,
    diffOnlyHandler,
    AspectsFactory,
    DefaultTargetDiffHandler,
    DefaultTransformPresentation,
    PullRequestTransformPresentationOptions,
    FingerprintExtensionPack,
    FingerprintImpactHandlerConfig,
    FingerprintOptions,
    RegisterFingerprintImpactHandler,
} from "./lib/machine/fingerprintSupport";
export {
    Aspect,
    AspectStats,
    ApplyFingerprint,
    DefaultStat,
    DefaultStatStatus,
    ExtractFingerprint,
    DiffSummaryFingerprint,
    FP,
    supportsEntropy,
    Vote,
    Diff,
} from "./lib/machine/Aspect";
export {
    fingerprintRunner,
    FingerprintComputer,
    FingerprintRunner,
} from "./lib/machine/runner";
export {
    renderDiffSnippet,
} from "./lib/support/util";
export {
    MessageMaker,
    messageMaker,
} from "./lib/checktarget/messageMaker";
export {
    consistentHash,
    commaSeparatedList,
} from "@atomist/clj-editors";
export {
    constructNpmDepsFingerprintName,
    deconstructNpmDepsFingerprintName,
    diffNpmDepsFingerprints,
    applyNpmDepsFingerprint,
    createNpmDepsFingerprints,
    NpmDeps,
    NpmCoordinates,
} from "./lib/fingerprints/npmDeps";
export {
    backpackFingerprint,
    applyBackpackFingerprint,
    Backpack,
} from "./lib/fingerprints/backpack";
export {
    MavenDeps,
    MavenCoordinates,
} from "./lib/fingerprints/maven";
export {
    ApplyTargetParameters,
} from "./lib/handlers/commands/applyFingerprint";
export * from "./lib/fingerprints/jsonFiles";
export {
    sha256,
} from "./lib/support/hash";

export {
    RebaseFailure,
    RebaseOptions,
    RebaseStrategy,
} from "./lib/handlers/commands/rebase";

export { PublishFingerprints, PublishFingerprintsFor, RepoIdentification, sendFingerprintsToAtomistFor } from "./lib/adhoc/fingerprints";

export * from "./lib/machine/AtomicAspect";

export * from "./lib/adhoc/construct";

export * from "./lib/machine/Ideal";

export * from "./lib/fingerprints/virtual-project/VirtualProjectFinder";
export * from "./lib/fingerprints/virtual-project/firstVirtualProjectFinderOf";
export * from "./lib/fingerprints/virtual-project/fileNamesVirtualProjectFinder";
export * from "./lib/fingerprints/virtual-project/makeVirtualProjectAware";
export * from "./lib/fingerprints/virtual-project/cachingVirtualProjectFinder";
