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
    BaseAspect,
    FP,
} from "./Aspect";

/**
 * Do we consider that the particular fingerprint is relevant to this project,
 * based on an intermediate format?
 */
export type RelevanceTest<SOURCE> = (fingerprintName: string, source: SOURCE) => boolean;

/**
 * Aspect derived from some intermediate representation of a project such as a ProjectAnalysis.
 * As with DerivedAspect, the intermediate calculation must have been completed in a previous phase.
 */
export interface DerivedAspect<SOURCE, FPI extends FP = FP> extends BaseAspect<FPI> {

    /**
     * Function to extract fingerprint(s) from an intermediate representation
     * of this project. Implementation does not have access to the Project itself
     * and should be relatively inexpensive as it depends on previously extracted
     * data such as a ProjectAnalysis.
     */
    derive: (source: SOURCE) => Promise<FPI | FPI[]>;

    /**
     * Is this aspect relevant to this project? For example, if
     * we are tracking TypeScript version, is this even a Node project?
     * Is the target at all relevant
     */
    relevanceTest?: RelevanceTest<SOURCE>;

    /**
     * Is this aspect desired on this project, according to our standards?
     */
    necessityTest?: RelevanceTest<SOURCE>;

}

export function isDerivedAspect(aspect: BaseAspect): aspect is DerivedAspect<any> {
    const maybe = aspect as DerivedAspect<any>;
    return !!maybe.derive;
}