import * as clj from "@atomist/clj-editors";
import {
    ExtensionPack,
    FingerprinterResult,
    PushImpactListener,
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import { metadata } from "@atomist/sdm/api-helper/misc/extensionPack";
import { Fingerprint } from "../../node_modules/@atomist/automation-client/project/fingerprint/Fingerprint";
import {
    BroadcastNudge,
    ChooseTeamLibrary,
    ClearLibraryTargets,
    ConfirmUpdate,
    IgnoreVersion,
    SetTeamLibrary,
    ShowGoals,
} from "../handlers/commands/pushImpactCommandHandlers";
import { PushImpactHandler } from "../handlers/events/pushImpactHandler";

function abbreviation(name: string): string {
    switch (name) {
        case "npm-project-deps": {
            return "npm-deps";
        }
        case "clojure-project-deps": {
            return "lein-deps";
        }
        case "maven-project-deps": {
            return "maven-deps";
        }
    }
    return "unknown";
}

const projectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        return clj.fingerprint(i.project.baseDir)
        .then(
            (result: clj.FP[]) => {
                return result;
        })
        .catch(
            error => {
                return [];
            },
        );
    };

export const FingerprintSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {

        sdm.addEvent(PushImpactHandler);

        sdm.addCommand(IgnoreVersion);
        sdm.addCodeTransformCommand(ConfirmUpdate);
        sdm.addCommand(SetTeamLibrary);
        sdm.addCodeInspectionCommand(ShowGoals);
        sdm.addCommand(ChooseTeamLibrary);
        sdm.addCommand(ClearLibraryTargets);
        sdm.addCommand(BroadcastNudge);

        sdm.addFingerprinterRegistration({
                name: "deps-fingerprinter",
                action: projectDeps,
            })
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async i => {
                    return [];
                },
            });
    },
};
