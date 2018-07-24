import * as clj from "@atomist/clj-editors";
<<<<<<< HEAD
import {ExtensionPack, FingerprinterResult, PushImpactListener, PushImpactListenerInvocation,} from "@atomist/sdm";
import {metadata} from "@atomist/sdm/api-helper/misc/extensionPack";
import {PushImpactHandler} from "../handlers/events/pushImpactHandler";
import {MavenFingerprinter} from "@atomist/sdm-pack-spring";
<<<<<<< HEAD
import { IgnoreVersion, SetTeamLibrary, ShowGoals, LibraryImpactChooseTeamLibrary } from "../handlers/commands/pushImpactCommandHandlers";
import { ConfirmUpdate } from "../handlers/commands/pushImpactCommandHandlers";
import { File } from "@atomist/automation-client/project/File";
=======
import {ConfirmUpdate, IgnoreVersion, SetTeamLibrary, ShowGoals} from "../handlers/commands/pushImpactCommandHandlers";
import {File} from "@atomist/automation-client/project/File";
>>>>>>> Tidying
=======
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
    ShowGoals
} from "../handlers/commands/pushImpactCommandHandlers";
import { File } from "@atomist/automation-client/project/File";
>>>>>>> Polish

const npmProjectDeps: PushImpactListener<FingerprinterResult> =
    async (i: PushImpactListenerInvocation) => {
        try {
            const f: File = await i.project.findFile("package.json");
            const data: string = clj.fingerprintPackageJson(i.project.baseDir, f);
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

export const FingerprintSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {

        sdm.addEvent(PushImpactHandler);

        sdm.addCommand(IgnoreVersion);
        sdm.addCommand(ConfirmUpdate);
        sdm.addCommand(SetTeamLibrary);
        sdm.addCommand(ShowGoals);

        sdm.addFingerprinterRegistration({
<<<<<<< HEAD
            name: "clj-fingerprinter",
            action: async i => {
                if (clj.isClojure(i.project.baseDir, i.credentials)) {
                    return clj.fingerprint(i.project.baseDir) as Promise<FingerprinterResult>;
                }
            },
        })
            .addFingerprinterRegistration(
                {
                    name: "npm-fingerprinter",
                    action: npmProjectDeps,
                })
=======
                name: "clj-fingerprinter",
                action: async i => {
                    if (clj.isClojure(i.project.baseDir, i.credentials)) {
                        return clj.fingerprint(i.project.baseDir) as Promise<FingerprinterResult>;
                    }
                },
            })
            .addFingerprinterRegistration({
                name: "npm-fingerprinter",
                action: npmProjectDeps,
            })
            .addFingerprinterRegistration(new MavenFingerprinter())
>>>>>>> Polish
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
