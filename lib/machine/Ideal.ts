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

import { FP } from "../cljEditors.index";

/**
 * An ideal for a given fingerprint. This may be a concrete
 * fingerprint instance, or an EliminationIdeal, which means that
 * the desired state is for all occurrences of this fingerprint to go away.
 */
export interface Ideal {
    /**
     * Reason for the choice
     */
    readonly reason: string;

    /**
     * URL, if any, associated with the ideal fingerprint instance.
     */
    readonly url?: string;
}

/**
 * An ideal for a fingerprint with a given name.
 */
export interface ConcreteIdeal extends Ideal {

    /**
     * The ideal fingerprint instance.
     */
    readonly ideal: FP;

}

export function isConcreteIdeal(ideal: Ideal): ideal is ConcreteIdeal {
    const maybe = ideal as ConcreteIdeal;
    return !!maybe && !!maybe.ideal;
}

/**
 * Ideal that says to eliminate fingerprints keyed this way
 */
export interface EliminationIdeal extends Ideal {

    readonly type: string;
    readonly name: string;

}

/**
 * Return the targeting of this ideal
 * @param {Ideal} ideal
 */
export function idealCoordinates(ideal: Ideal): { type?: string, name: string } {
    return isConcreteIdeal(ideal) ? ideal.ideal : ideal as EliminationIdeal;
}
