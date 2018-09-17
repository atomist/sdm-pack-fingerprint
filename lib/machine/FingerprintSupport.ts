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

import { HandlerContext } from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    ExtensionPack,
    Fingerprint,
    FingerprinterRegistration,
    FingerprinterResult,
    logger,
    metadata,
    PushImpactListener,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { SendFingerprintToAtomist } from "@atomist/sdm-core/lib/util/webhook/sendFingerprintToAtomist";
import {
    BroadcastNudge,
    ChooseTeamLibrary,
    ClearLibraryTargets,
    ConfirmUpdate,
    DumpLibraryPreferences,
    IgnoreVersion,
    SetTeamLibrary,
    ShowGoals,
    ShowTargets,
} from "../handlers/commands/pushImpactCommandHandlers";
import { pushImpactHandler } from "../handlers/events/pushImpactHandler";

const projectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        return clj.fingerprint(i.project.baseDir)
            .then(
                (result: clj.FP[]) => {
                    logger.info("Fingerprint result: %s", JSON.stringify(result));
                    return result;
                })
            .catch(
                error => {
                    logger.error(error);
                    return [];
                },
            );
    };

export const DepsFingerprintRegistration: FingerprinterRegistration = {
    name: "deps-fingerprinter",
    action: projectDeps,
};

export interface FingerprintHandler {
    selector: (name: clj.FP) => boolean;
    diffHandler?: (context: HandlerContext, diff: clj.Diff) => Promise<any>;
}

export function fingerprintSupport(goals: Fingerprint | Fingerprint[] = [], ...handlers: FingerprintHandler[]): ExtensionPack {
    (Array.isArray(goals) ? goals : [goals]).forEach(g => {
        g.with(DepsFingerprintRegistration);
        g.withListener(SendFingerprintToAtomist);
    });

    return {
        ...metadata(),
        configure: (sdm: SoftwareDeliveryMachine) => {
            configure( sdm, handlers);
        },
    };
}

function configure(sdm: SoftwareDeliveryMachine, handlers: FingerprintHandler[]): void {
    sdm.addEvent(pushImpactHandler(handlers));
    sdm.addCommand(IgnoreVersion);
    sdm.addCodeTransformCommand(ConfirmUpdate);
    sdm.addCommand(SetTeamLibrary);
    sdm.addCodeInspectionCommand(ShowGoals);
    sdm.addCommand(ChooseTeamLibrary);
    sdm.addCommand(ClearLibraryTargets);
    sdm.addCommand(BroadcastNudge);
    sdm.addCommand(ShowTargets);
    sdm.addCommand(DumpLibraryPreferences);
}
