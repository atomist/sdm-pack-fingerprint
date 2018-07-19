import { logger } from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    ExtensionPack,
    FingerprinterResult,
    PushImpactListenerInvocation,
    PushImpactListener,
} from "@atomist/sdm";
import { metadata } from "@atomist/sdm/api-helper/misc/extensionPack";
import { PushImpactHandler } from "../handlers/events/pushImpactHandler";
import { allDeps } from "../npm/deps";
import { File } from "@atomist/automation-client/project/File";
import { Fingerprint } from "@atomist/automation-client/project/fingerprint/Fingerprint";
import {MavenFingerprinter} from "@atomist/sdm-pack-spring";
import { IgnoreVersion, SetTeamLibrary, ShowGoals } from "../handlers/commands/pushImpactCommandHandlers";
import { ConfirmUpdate } from "../handlers/commands/pushImpactCommandHandlers";

const npmProjectDeps: PushImpactListener<FingerprinterResult> = 
    async (i: PushImpactListenerInvocation) => {
        try {
            const f: File = await i.project.findFile("package.json");
            const data: string = clj.fingerprintPackageJson(i.project.baseDir, f);
            return [{"name": "npm-project-deps",
                     "version": "0.0.1",
                     "abbreviation": "npm-deps",
                     "sha": clj.sha256(data),
                     "data": data,
                     "value": data}];
        } catch (err){
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
                name: "clj-fingerprinter",
                action: (i: PushImpactListenerInvocation) => {
                    if (clj.isClojure(i.project.baseDir, i.credentials)) {
                        return clj.fingerprint(i.project.baseDir) as Promise<FingerprinterResult>;
                    }
                },
            })
            .addFingerprinterRegistration(
                {name: "npm-fingerprinter",
                 action: npmProjectDeps})
            .addFingerprinterRegistration(new MavenFingerprinter())
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
