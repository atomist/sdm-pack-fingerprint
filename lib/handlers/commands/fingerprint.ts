/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    logger,
    ParameterType,
    SuccessPromise,
    menuForCommand,
} from "@atomist/automation-client";
import { Options } from "@atomist/automation-client/lib/metadata/automationMetadata";
import { CommandHandlerRegistration } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";

interface FingerprintOption {
    value: string,
    description: string,
}

const options: FingerprintOption[] = [
    {
        value: "fingerprints",
        description: "list fingerprints",
    },
    {
        value: "targets",
        description: "list targets",
    },
];

const fingerprintOptions: FingerprintOption[] = [
    {
        value: "fingeprint1",
        description: "aslfjal;sdjf;as"
    },
    {
        value: "fingerprint2",
        description: "al;sdjflkajklasdf"
    }
];

const targetOptions: FingerprintOption[] = [
    {
        value: "target1",
        description: "aslfjal;sdjf;as"
    },
    {
        value: "target2",
        description: "al;sdjflkajklasdf"
    }
]

const Subcommand: Options = {
    kind: "single",
    options,
};

export interface FingerprintParameters extends ParameterType {
    subcommand: string;
    next: string;
}

function nextParameter(options: FingerprintOption[], parameter: string, partials: any): SlackMessage {
    return {
        attachments:
            [{
                text: `Choose an Option`,
                fallback: `Require Option choice`,
                color: "#ffcc00",
                mrkdwn_in: ["text"],
                actions: [
                    menuForCommand(
                        {
                            text: "choose",
                            options: [...options.map(o => {return {value: o.value, text: o.description}})],
                        },
                        FingerprintEverything.name,
                        parameter,
                        partials,
                    )
                ],
            }],
    };
}

export const FingerprintEverything: CommandHandlerRegistration<FingerprintParameters> = {
    name: "FingerprintEverything",
    description: "query fingerprints",
    intent: "fingerprints",
    parameters: {
        subcommand: {
            required: false,
            type: Subcommand,
        },
        next: {
            required: false,
        }
    },
    listener: i => {
        logger.info(`choose ${i.parameters.subcommand} and ${i.parameters.next}`);
        if (i.parameters.subcommand === undefined) {
            return i.addressChannels(nextParameter(options, "subcommand", {}));
        } else if (i.parameters.next === undefined) {
            switch (i.parameters.subcommand) {
                case "fingerprints": {
                    return i.addressChannels(nextParameter( fingerprintOptions, "next", {subcommand: i.parameters.subcommand}));
                }
                case "targets": {
                    return i.addressChannels(nextParameter( targetOptions, "next", {subcommand: i.parameters.subcommand}));
                }
            }   
        } else {
            switch (i.parameters.subcommand) {
                case "fingerprints": {
                    return i.addressChannels(`show fingerprint ${i.parameters.next}`);
                }
                case "targets": {
                    return i.addressChannels(`show thing ${i.parameters.next}`);
                }
            }
        }
        return SuccessPromise;
    },
    autoSubmit: true,
};
