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
    HandlerContext,
} from "@atomist/automation-client";
import {
    ExtensionPack,
    Fingerprint,
    FingerprinterResult,
    metadata,
    PushImpactListener,
    PushImpactListenerInvocation,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import * as fingerprints from "../../fingerprints/index";
import { ApplyTargetFingerprint } from "../backpack/applyFingerprint";
import { UpdateTargetFingerprint } from "../backpack/updateTarget";
import { BroadcastNudge } from "../handlers/commands/broadcast";
import { ConfirmUpdate } from "../handlers/commands/confirmUpdate";
import { IgnoreVersion } from "../handlers/commands/ignoreVersion";
import {
    ChooseTeamLibrary,
    SetTeamLibrary,
} from "../handlers/commands/setLibraryGoal";
import {
    ClearLibraryTargets,
    DumpLibraryPreferences,
    ShowGoals,
    ShowTargets,
} from "../handlers/commands/showTargets";
import { UseLatest } from "../handlers/commands/useLatest";
import { pushImpactHandler } from "../handlers/events/pushImpactHandler";

/**
 * run fingerprints on every Push
 * send them in batch
 *
 * @param i
 */
function runFingerprints(fingerprinter: FingerprintRunner): PushImpactListener<FingerprinterResult> {
    return async (i: PushImpactListenerInvocation) => {
        return fingerprinter((i.project).baseDir);
    };
}

export type FingerprintRunner = (basedir: string) => Promise<fingerprints.FP[]>;

export interface FingerprintHandler {
    selector: (name: fingerprints.FP) => boolean;
    diffHandler?: (context: HandlerContext, diff: fingerprints.Diff) => Promise<any>;
    handler?: (context: HandlerContext, diff: fingerprints.Diff) => Promise<any>;
}

export function fingerprintSupport(
    goals: Fingerprint | Fingerprint[] = [],
    fingerprinter: FingerprintRunner,
    ...handlers: FingerprintHandler[]): ExtensionPack {

    (Array.isArray(goals) ? goals : [goals]).forEach(g => {
        g.with({
            name: "fingerprinter",
            action: runFingerprints(fingerprinter),
        });
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
    sdm.addCommand(UseLatest);
    sdm.addCommand(UpdateTargetFingerprint);
    sdm.addCodeTransformCommand(ApplyTargetFingerprint);
}
