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

export const FingerprintEverything: CommandHandlerRegistration = {
    name: "FingerprintEverything",
    description: "query fingerprints",
    intent: "fingerprints",
    listener: i => {

        i.promptFor({
            operation: {
                required: true, type: {
                    kind: "single", options: [
                        { value: "a", description: "b" },
                        { value: "b", description: "b" }],
                },
            },
        }).then(result => {
            logger.info("okay");
            return i.context.messageClient.respond(`this worked ${result.operation}`);
        },
        ).catch(error => {
            logger.info(`error ${error}`);
        },
        );
        return SuccessPromise;
    },
    autoSubmit: true,
};
