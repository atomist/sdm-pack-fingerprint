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
    GitHubRepoRef,
} from "@atomist/automation-client";
import {
    CodeTransform,
    GeneratorRegistration,
    goals,
    Goals,
    PushImpact,
    pushTest,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
    goalStateSupport,
} from "@atomist/sdm-core";
import {
    fingerprintSupport,
    NpmCoordinates,
    NpmDeps,
} from "..";
import { Backpack } from "../lib/fingerprints/backpack";
import {
    JsonFile,
} from "../lib/fingerprints/jsonFiles";

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

export const pushImpact = new PushImpact();
const FingerprintingGoals: Goals = goals("check fingerprints")
    .plan(pushImpact, // complianceGoal
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
        goalStateSupport(),
        fingerprintSupport({
            pushImpactGoal: pushImpact,
            aspects:
                [
                    NpmDeps,
                    NpmCoordinates,
                    JsonFile,
                    Backpack,
                ],
        }),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
