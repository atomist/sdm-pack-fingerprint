import { buttonForCommand } from "@atomist/automation-client";
import { CommandHandlerRegistration, slackQuestionMessage } from "@atomist/sdm";
import { ListFingerprints } from "./list";

export const FingerprintMenu: CommandHandlerRegistration = {
    name: "FingerprintMenu",
    intent: ["fingerprints"],
    description: "show a fingerprints menu",
    listener: async cli => {

        const message = slackQuestionMessage(
            "Fingerprint Menu",
            `Choose a Command`,
            {
                actions: [
                    buttonForCommand(
                        { text: "List Fingerprints" },
                        ListFingerprints.name,
                        {},
                    ),
                    buttonForCommand(
                        { text: "List Targets" },
                        "ListFingerprintTargets",
                        {},
                    ),
                    buttonForCommand(
                        { text: "Set target" },
                        "SelectTargetFingerprintFromCurrentProject",
                        {},
                    ),
                ],
            });

        return cli.addressChannels(message);
    },
};
