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

import { FailurePromise, logger, ParameterType } from "@atomist/automation-client";
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
