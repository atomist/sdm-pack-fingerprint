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

import {sha256} from "@atomist/clj-editors";
import {FP} from "../machine/Aspect";

/**
 * Convenience function to create a new fingerprint, using default strategy of
 * sha-ing stringified data.
 * Type must be supplied. Name is optional, and will default
 * to type.
 * @return {FP}
 */
export function fingerprintOf<DATA = any>(opts: {
    type: string,
    name?: string,
    data: DATA}): FP<DATA> {
    return {
        type: opts.type,
        name: opts.name || opts.type,
        data: opts.data,
        sha: sha256(JSON.stringify(opts.data)),
    };
}
