import * as clj from "@atomist/clj-editors";
import {
    ExtensionPack,
    FingerprinterResult,
    PushImpactListener,
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import { metadata } from "@atomist/sdm/api-helper/misc/extensionPack";
import { PushImpactHandler } from "../handlers/events/pushImpactHandler";
import { MavenFingerprinter } from "@atomist/sdm-pack-spring";
import {
    ConfirmUpdate,
    IgnoreVersion,
    SetTeamLibrary,
    ShowGoals,
    LibraryImpactChooseTeamLibrary
} from "../handlers/commands/pushImpactCommandHandlers";
import { File } from "@atomist/automation-client/project/File";

function abbreviation(name: string): string {
    switch(name) {
        case "npm-project-deps": {
            return "npm-deps";
        }
        case "clojure-project-deps": {
            return "lein-deps";
        }
        case "maven-project-deps": {
            return "maven-deps"
        }
    };
    return "unknown";
}

const projectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        try {
            return clj.fingerprint(i.project.baseDir, (name, version, data) => {
                return [{
                    "name": name,
                    "version": version,
                    "abbreviation": abbreviation(name),
                    "sha": clj.sha256(data),
                    "data": data,
                    "value": data
                }];
            });
        } catch (err) {
            return [];
        }
    };

    // npm-project-deps and clojure-project-deps

export const FingerprintSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {

        sdm.addEvent(PushImpactHandler);

        sdm.addCommand(IgnoreVersion);
        sdm.addCodeTransformCommand(ConfirmUpdate);
        sdm.addCommand(SetTeamLibrary);
        sdm.addCodeInspectionCommand(ShowGoals);
        sdm.addCommand(LibraryImpactChooseTeamLibrary);

        sdm.addFingerprinterRegistration({
                name: "deps-fingerprinter",
                action: projectDeps,
            })
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
