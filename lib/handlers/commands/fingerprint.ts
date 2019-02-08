import { FailurePromise, ParameterType, logger } from "@atomist/automation-client";
import { Options } from "@atomist/automation-client/lib/metadata/automationMetadata";
import { CommandHandlerRegistration } from "@atomist/sdm";

const Subcommand: Options = {
    kind: "single",
    options: [
        {
            value: "fingerprints",
            description: "list fingerprints",
        },
        {
            value: "targets",
            description: "list targets",
        },
    ],
};

export interface FingerprintParameters extends ParameterType {
    subcommand: string;
}

export const FingerprintEverything: CommandHandlerRegistration<FingerprintParameters> = {
    name: "FingerprintEverything",
    description: "query fingerprints",
    intent: "fingerprints",
    parameters: {
        subcommand: {
            required: true,
            type: Subcommand,
        },
    },
    listener: i => {
        logger.info(`choose ${i.parameters.subcommand}`);
        switch (i.parameters.subcommand) {
            case "fingerprints": {
                return i.addressChannels("list fingerprints");
            }
            case "targets": {
                return i.addressChannels("list targets");
            }
            default: {
                return FailurePromise;
            }
        }
    },
    autoSubmit: true,
};
