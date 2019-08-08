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

import {Project} from "@atomist/automation-client";
import {ApplyFingerprint, Aspect, ExtractFingerprint, FP} from "../../machine/Aspect";
import {VirtualProjectFinder, VirtualProjectStatus} from "./VirtualProjectFinder";

import * as _ from "lodash";
import {localProjectUnder} from "./support/localProjectUnder";

/**
 * Function that knows how to return a virtual project
 * that will behave like the original paths except for path mapping
 */
export type Descender = (p: Project, pathUnder: string) => Promise<Project>;

/**
 * Turn this fingerprint into a multi fingerprint
 * @param {ExtractFingerprint} ef extractor
 * @param virtualProjectFinder subproject finder
 * @return {ExtractFingerprint}
 */
export function makeExtractorVirtualProjectAware(ef: ExtractFingerprint,
                                                 virtualProjectFinder: VirtualProjectFinder): (p: Project) => Promise<FP[]> {
    return async p => {
        const virtualProjects = await virtualProjectsIn(p, virtualProjectFinder, localProjectUnder);
        return _.flatten(await Promise.all(virtualProjects.map(vp =>
                extractFrom(ef, vp)
                    .then(extracted =>
                        extracted
                            .filter(raw => !!raw)
                            .map(raw => (
                                {
                                    ...raw,
                                    path: vp.id.path,
                                })),
                    ),
            ),
        ));
    };
}

async function virtualProjectsIn(p: Project, virtualProjectFinder: VirtualProjectFinder, descender: Descender): Promise<Project[]> {
    const virtualProjectInfo = await virtualProjectFinder.findVirtualProjectInfo(p);
    if (virtualProjectInfo.status === VirtualProjectStatus.IdentifiedPaths) {
        return Promise.all(virtualProjectInfo.virtualProjects.map(sp => descender(p, sp.path)));
    }
    return [p];
}

async function extractFrom(ef: ExtractFingerprint, p: Project): Promise<FP[]> {
    const extracted = await ef(p);
    return extracted ?
        Array.isArray(extracted) ? extracted : [extracted] :
        [];
}

export function makeApplyVirtualProjectAware(af: ApplyFingerprint,
                                             virtualProjectFinder: VirtualProjectFinder,
                                             descender: Descender = localProjectUnder): ApplyFingerprint {
    return async (p, fp) => {
        const virtualProjects = await virtualProjectsIn(p, virtualProjectFinder, descender);
        const results = await Promise.all(virtualProjects.map(vp => af(vp, fp)));
        return !results.includes(false);
    };
}

/**
 * Make this aspect work with virtual projects as found by the given
 * VirtualProjectFinder
 * @param {Aspect} aspect to make virtual project aware
 * @param {VirtualProjectFinder} virtualProjectFinder
 * @return {Aspect}
 */
export function makeVirtualProjectAware(aspect: Aspect, virtualProjectFinder: VirtualProjectFinder): Aspect {
    return {
        // TODO does this keep methods?
        ...aspect,
        extract: makeExtractorVirtualProjectAware(aspect.extract, virtualProjectFinder),
        apply: aspect.apply ? makeApplyVirtualProjectAware(aspect.apply, virtualProjectFinder) : undefined,
    };
}
