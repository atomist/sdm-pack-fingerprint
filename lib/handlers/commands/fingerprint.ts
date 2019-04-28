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
    SuccessPromise,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";

export const FingerprintEverything: CommandHandlerRegistration<{ optional?: string, required: string }> = {
    name: "FingerprintEverything",
    description: "query fingerprints",
    intent: "fingerprints",
    parameters: {
        optional: { required: false },
        required: { required: true },
    },
    listener: i => {

        i.promptFor({
            operation: {
                required: true,
                type: {
                    kind: "single",
                    options: [
                        { value: "list", description: "li`st" },
                        { value: "set", description: "set" }],
                },
            },
        }).then(result => {
            logger.info(`result ${result.operation} ${i.parameters.optional} ${i.parameters.required}`);
            return i.context.messageClient.respond(`this worked ${result.operation} ${i.parameters.optional} ${i.parameters.required}`);
        },
        ).catch(error => {
            logger.info(`error ${error}`);
        },
        );
        return SuccessPromise;
    },
    autoSubmit: true,
};
