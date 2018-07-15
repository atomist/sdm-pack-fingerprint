import { logger } from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import { ExtensionPack,
         FingerprinterResult,
         PushImpactListenerInvocation} from "@atomist/sdm";
import { createPushImpactHandler } from "../handlers/events/pushImpactHandler";

export const FingerprintSupport: ExtensionPack = {
    name: "Fingerprint Support",
    vendor: "Atomist",
    version: "0.0.1",
    configure: sdm => {

        sdm.addSupportingEvents(createPushImpactHandler);

        sdm.addFingerprinterRegistrations(
            {
                name: "clj-fingerprinter",
                action: (i: PushImpactListenerInvocation) => {
                    if (clj.isClojure(i.project.baseDir,i.credentials)) {
                        logger.info("generate some clojure fingerprints");
                        return clj.fingerprint(i.project.baseDir) as Promise<FingerprinterResult>;
                    }
                },
            },
            {
                name: "npm-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                }
            },
            {
                name: "js-fingerprinter",
                action: async (i: PushImpactListenerInvocation) => {
                    return [];
                }
            }
        );
    },
};
