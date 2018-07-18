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
import { File } from "../../node_modules/@atomist/automation-client/project/File";
import { Fingerprint } from "../../node_modules/@atomist/automation-client/project/fingerprint/Fingerprint";

const fp: Fingerprint = {name: "npm-project-deps", 
                         version: "0.0.1",
                         sha: "",
                         abbreviation: "",
                         data: ""};

const npmProjectDeps: PushImpactListener<FingerprinterResult> = 
    async (i: PushImpactListenerInvocation) => {
        try {
            let f: File = await i.project.findFile("package.json");
            return [fp];
        } catch (err){
            return [];
        }
    };

export const FingerprintSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {

        sdm.addEvent(PushImpactHandler);

        sdm.addFingerprinterRegistration({
                name: "clj-fingerprinter",
                action: (i: PushImpactListenerInvocation) => {
                    if (clj.isClojure(i.project.baseDir, i.credentials)) {
                        logger.info("generate some clojure fingerprints");
                        return clj.fingerprint(i.project.baseDir) as Promise<FingerprinterResult>;
                    }
                },
            })
            .addFingerprinterRegistration(
                {name: "npm-fingerprinter",
                 action: npmProjectDeps})
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
