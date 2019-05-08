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
    SuccessPromise,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";

interface FingerprintParameters {
    operation: string,
}

export const FingerprintEverything: CommandHandlerRegistration<FingerprintParameters> = {
    name: "FingerprintEverything",
    description: "query fingerprints",
    intent: "fingerprints",
    parameters: {
        operation: {
            required: true,
            type: {
                kind: "single",
                options: [
                    { value: "list", description: "list fingerprints" },
                    { value: "set", description: "set target fingerprint using current" },
                    { value: "targets", description: "list target fingerprints" }],
            },
        },
    },
    listener: async i => {
        switch (i.parameters.operation) {
            case "list": {
                //await ListFingerprints.listener(i);

                break;
            }
            case "set": {
                //await SelectTargetFingerprintFromCurrentProject.listener(i);
                break;
            }
            case "targets": {
                //await 
            }
        }
        return SuccessPromise;
    },
    autoSubmit: true,
};
