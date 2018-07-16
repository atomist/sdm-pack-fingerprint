import { logger } from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    ExtensionPack,
    FingerprinterResult,
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import { metadata } from "@atomist/sdm/api-helper/misc/extensionPack";
import { PushImpactHandler } from "../handlers/events/pushImpactHandler";

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
            .addFingerprinterRegistration({
                name: "npm-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            })
            .addFingerprinterRegistration({
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                },
            });
    },
};
