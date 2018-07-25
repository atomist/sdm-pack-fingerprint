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

const npmProjectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        try {
            const data: string = clj.fingerprint(i.project.baseDir);
            return [{
                "name": "npm-project-deps",
                "version": "0.0.1",
                "abbreviation": "npm-deps",
                "sha": clj.sha256(data),
                "data": data,
                "value": data
            }];
        } catch (err) {
            return [];
        }
    };

const cljProjectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        try {
            const data: string = clj.fingerprint(i.project.baseDir);
            return [{
                "name": "clojure-project-deps",
                "version": "0.0.1",
                "abbreviation": "lein-deps",
                "sha": clj.sha256(data),
                "data": data,
                "value": data
            }];
        } catch (err) {
            return [];
        }
    };

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
                name: "clj-fingerprinter",
                action: cljProjectDeps,
            })
            .addFingerprinterRegistration({
                name: "npm-fingerprinter",
                action: npmProjectDeps,
            })
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
