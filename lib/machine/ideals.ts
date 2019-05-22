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

import { FP } from "../../fingerprints";

export interface PossibleIdeal<FPI extends FP> {
    ideal: FPI;
    reason: string;
    url?: string;
}

export interface PossibleIdeals<FPI extends FP> {

    /**
     * Ideal found from wider world--e.g. a package repository
     */
    world?: PossibleIdeal<FPI>;

    /**
     * Ideal based on what we've found internally
     */
    fromProjects?: PossibleIdeal<FPI>;

    /**
     * Ideals managed internally in an organization
     */
    custom?: Array<PossibleIdeal<FPI>>;
}
