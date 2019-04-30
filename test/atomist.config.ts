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
    Configuration,
    editModes,
    GitHubRepoRef,
} from "@atomist/automation-client";
import {
    AutoMergeMethod,
    AutoMergeMode,
} from "@atomist/automation-client/lib/operations/edit/editModes";
import {
    CodeTransform,
    Fingerprint,
    GeneratorRegistration,
    goals,
    Goals,
    //    GoalWithFulfillment,
    pushTest,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
    goalState,
} from "@atomist/sdm-core";
import {
    fingerprintImpactHandler,
    fingerprintSupport,
    messageMaker,
} from "..";
import {
    applyFingerprint,
    cljFunctionFingerprints,
    depsFingerprints,
    logbackFingerprints,
    renderClojureProjectDiff,
} from "../fingerprints";
import {
    applyBackpackFingerprint,
    backpackFingerprint,
} from "../lib/fingerprints/backpack";
import {
    applyDockerBaseFingerprint,
    dockerBaseFingerprint,
} from "../lib/fingerprints/dockerFrom";
import {
    applyFileFingerprint,
    createFileFingerprint,
} from "../lib/fingerprints/jsonFiles";
import {
    applyNpmDepsFingerprint,
    createNpmDepsFingerprints,
    diffNpmDepsFingerprints,
} from "../lib/fingerprints/npmDeps";
import {
    checkCljCoordinatesImpactHandler,
    checkNpmCoordinatesImpactHandler,
} from "../lib/machine/fingerprintSupport";

const IsNpm: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("package.json")),
);

const IsClojure: PushTest = pushTest(`contains project.clj file`, async pci =>
    !!(await pci.project.getFile("project.clj")),
);

const IsTest: PushTest = pushTest(`contains touch.txt file`, async pci =>
    !!(await pci.project.getFile("touch.txt")),
);

// const complianceGoal = new GoalWithFulfillment(
//     {
//         uniqueName: "backpack-react-script-compliance",
//         displayName: "backpack-compliance",
//     },
// ).with(
//     {
//         name: "backpack-react-waiting",
//     },
// );

const CljFingerprintTargets: CodeTransform = async (p, papi, params) => {

    return p;
};

const CljServiceGenerator: GeneratorRegistration = {
    name: "clojure service",
    intent: "make clj service",
    startingPoint: GitHubRepoRef.from({
        owner: "atomist-seeds",
        repo: "empty",
    }),
    transform: CljFingerprintTargets,
};

// const SpecialHelp: CommandHandlerRegistration<NoParameters> = {
//     name: "SpecialHelp",
//     intent: "show skills",
//     listener: inv => {
//         return inv.addressChannels("show some help");
//     },
// };

export const FingerprintGoal = new Fingerprint();
const FingerprintingGoals: Goals = goals("check fingerprints")
    .plan(FingerprintGoal, //complianceGoal
    );

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
        whenPushSatisfies(IsNpm)
            .itMeans("fingerprint an npm project")
            .setGoals(FingerprintingGoals),
        whenPushSatisfies(IsClojure)
            .itMeans("fingerprint a clojure project")
            .setGoals(FingerprintingGoals),
        whenPushSatisfies(IsTest)
            .itMeans("fingeprint an empty project")
            .setGoals(FingerprintingGoals),
    );

    sdm.addGeneratorCommand(CljServiceGenerator);

    sdm.addExtensionPacks(
        goalState(),
        fingerprintSupport({
            fingerprintGoal: FingerprintGoal,
            fingerprints:
                [
                    {
                        extract: createNpmDepsFingerprints,
                        apply: applyNpmDepsFingerprint,
                        selector: fp => fp.name.startsWith("npm-project-dep"),
                        summary: diffNpmDepsFingerprints,
                    },
                    {
                        apply: applyDockerBaseFingerprint,
                        extract: dockerBaseFingerprint,
                        selector: myFp => myFp.name.startsWith("docker-base-image"),
                    },
                    {
                        extract: backpackFingerprint,
                        apply: applyBackpackFingerprint,
                        selector: fp => fp.name === "backpack-react-scripts",
                    },
                    {
                        extract: p => logbackFingerprints(p.baseDir),
                        apply: (p, fp) => applyFingerprint(p.baseDir, fp),
                        selector: fp => fp.name === "elk-logback",
                    },
                    {
                        extract: p => depsFingerprints(p.baseDir),
                        apply: (p, fp) => applyFingerprint(p.baseDir, fp),
                        selector: fp => {
                            return fp.name.startsWith("maven-project") || fp.name.startsWith("clojure-project");
                        },
                        summary: renderClojureProjectDiff,
                    },
                    {
                        extract: p => cljFunctionFingerprints(p.baseDir),
                        apply: (p, fp) => applyFingerprint(p.baseDir, fp),
                        selector: fp => fp.name.startsWith("public-defn-bodies"),
                    },
                    {
                        extract: createFileFingerprint(
                            "tslint.json",
                            "tsconfig.json"),
                        apply: applyFileFingerprint,
                        selector: fp => fp.name.startsWith("file-"),
                    },
                ],
            handlers: [
                checkNpmCoordinatesImpactHandler(),
                checkCljCoordinatesImpactHandler(),
                fingerprintImpactHandler(
                    {
                        //complianceGoal,
                        transformPresentation: (ci, p) => {
                            // name the branch apply-target-fingerprint with a Date
                            // title can be derived from ApplyTargetParameters
                            // body can be derived from ApplyTargetParameters
                            // optional message is undefined here
                            // target branch is hard-coded to master
                            return new editModes.PullRequest(
                                `apply-target-fingerprint-${Date.now()}`,
                                `${ci.parameters.title}`,
                                `> generated by Atomist \`\`\`${ci.parameters.body}\`\`\``,
                                undefined,
                                ci.parameters.branch || "master",
                                {
                                    method: AutoMergeMethod.Squash,
                                    mode: AutoMergeMode.ApprovedReview,
                                });
                        },
                        messageMaker,
                    },
                )],
        },
        ),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
