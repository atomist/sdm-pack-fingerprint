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

import {
    Configuration,
    GitProject,
    logger,
} from "@atomist/automation-client";
import {
    allSatisfied,
    Fingerprint,
    goals,
    Goals,
    GoalWithFulfillment,
    pushTest,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import {
    applyFingerprint,
    depsFingerprints,
    fingerprintSupport,
    forFingerprints,
    FP,
    logbackFingerprints,
    renderData,
    renderDiffSnippet,
} from "..";
import { checkFingerprintTargets } from "../lib/fingerprints/impact";
import { setNewTarget } from "../lib/handlers/commands/setLibraryGoal";

const IsNpm: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("package.json")),
);

export const FingerprintGoal = new Fingerprint();
export const backpackComplianceGoal = new GoalWithFulfillment(
    {
        uniqueName: "backpack-react-script-compliance",
        displayName: "check backpack react script compliance",
        workingDescription: "Checking backpack react scripts",
        completedDescription: "Backpack react scripts are in sync",
        failedDescription: "Backpack react scripts are out of sync"
    }
);
const FingerprintingGoals: Goals = goals("check fingerprints")
    .plan(FingerprintGoal, backpackComplianceGoal);

backpackComplianceGoal.with(
    {
        name: "backpackCompliance",
        pushTest: allSatisfied(IsNpm),
    });

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
        whenPushSatisfies(IsNpm)
            .itMeans("fingerprint an npm project")
            .setGoals(FingerprintingGoals)
    );

    sdm.addExtensionPacks(
        fingerprintSupport(
            FingerprintGoal,
            // runs on every push!!
            async (p: GitProject) => {
                const fps = [].concat(
                    await depsFingerprints(p.baseDir),
                ).concat(
                    await logbackFingerprints(p.baseDir),
                );
                logger.info(renderData(fps));
                return fps;
            },
            // currently scheduled only when a user chooses to apply the fingerprint
            async (p: GitProject, fp: FP) => {
                return applyFingerprint(p.baseDir, fp);
            },
            {
                selector: forFingerprints(
                    "npm-project-deps"),
                diffHandler: renderDiffSnippet,
            },
            {
                selector: forFingerprints(
                    "npm-project-coordinates"),
                diffHandler: async (ctx, diff) => {
                    return setNewTarget(
                        ctx,
                        diff.to.name,
                        diff.to.data.name,
                        diff.to.data.version,
                        diff.channel);
                },
            },
            {
                selector: forFingerprints("backpack-react-scripts"),
                handler: async (ctx, diff) => {
                    return checkFingerprintTargets(ctx, diff, backpackComplianceGoal);
                },
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
