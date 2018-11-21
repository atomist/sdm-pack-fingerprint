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

import { Configuration, GitProject } from "@atomist/automation-client";
import {
    Fingerprint,
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
    fingerprintSupport,
    forFingerprints,
    renderDiffSnippet,
} from "..";
import * as fingerprints from "../fingerprints/index";
import { checkFingerprintTargets } from "../lib/fingerprints/impact";
import { setNewTarget } from "../lib/handlers/commands/setLibraryGoal";

const IsNpm: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("package.json")),
);

export const FingerprintGoal = new Fingerprint();

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
        name: `${configuration.name}-test`,
        configuration: config,
    },
        whenPushSatisfies(IsNpm)
            .itMeans("fingerprint an npm project")
            .setGoals(FingerprintGoal));

    sdm.addExtensionPacks(
        fingerprintSupport(
            FingerprintGoal,
            // runs on every push!!
            async (p: GitProject) => {
                return fingerprints.fingerprint(p.baseDir);
            },
            // currently scheduled only when a user chooses to apply the fingerprint
            async (p: GitProject, fp: fingerprints.FP) => {
                return fingerprints.applyFingerprint(p.baseDir, fp);
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
                    return checkFingerprintTargets(ctx, diff);
                },
                diffHandler: async (ctx, diff) => {
                    return renderDiffSnippet(ctx, diff);
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
