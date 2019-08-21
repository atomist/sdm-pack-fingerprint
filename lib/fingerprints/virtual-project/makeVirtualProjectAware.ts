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

import { Project } from "@atomist/automation-client";
import { chainTransforms } from "@atomist/sdm";
import * as _ from "lodash";
import {
    ApplyFingerprint,
    Aspect,
    ExtractFingerprint,
    FP,
} from "../../machine/Aspect";
import { localProjectUnder } from "./support/localProjectUnder";
import {
    VirtualProjectFinder,
    VirtualProjectStatus,
} from "./VirtualProjectFinder";

/**
 * Make this aspect work with virtual projects as found by the given
 * VirtualProjectFinder
 * @param {Aspect} aspect to make virtual project aware
 * @param {VirtualProjectFinder} virtualProjectFinder. If not supplied, return the
 * original aspect.
 * @return {Aspect}
 */
export function makeVirtualProjectAware<A extends Aspect>(aspect: A, virtualProjectFinder: VirtualProjectFinder): A {
    return !!virtualProjectFinder && !aspect.baseOnly ? {
            ...aspect,
            // Wrap extract. AtomistAspects don't need wrapping as the aspects they build on
            // should have been wrapped
            extract: makeExtractorVirtualProjectAware(aspect.extract, virtualProjectFinder),
            apply: aspect.apply ? makeApplyVirtualProjectAware(aspect.apply, virtualProjectFinder) : undefined,
        } :
        aspect;
}

/**
 * Turn this fingerprint into a multi fingerprint
 * @param {ExtractFingerprint} ef extractor
 * @param virtualProjectFinder virtual project finder
 * @return {ExtractFingerprint}
 */
export function makeExtractorVirtualProjectAware(ef: ExtractFingerprint,
                                                 virtualProjectFinder: VirtualProjectFinder): (p: Project) => Promise<FP[]> {
    return async p => {
        const virtualProjects = await virtualProjectsIn(p, virtualProjectFinder);
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

async function virtualProjectsIn(p: Project, virtualProjectFinder: VirtualProjectFinder): Promise<Project[]> {
    const virtualProjectInfo = await virtualProjectFinder.findVirtualProjectInfo(p);
    if (virtualProjectInfo.status === VirtualProjectStatus.IdentifiedPaths) {
        return Promise.all(virtualProjectInfo.virtualProjects.map(sp => localProjectUnder(p, sp.path)));
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
                                             virtualProjectFinder: VirtualProjectFinder): ApplyFingerprint {
    return async (p, papi) => {
        const virtualProjects = await virtualProjectsIn(p, virtualProjectFinder);
        return chainTransforms(...virtualProjects.map(v => (async (vp: any, vpapi: any) => af(v, vpapi))))(p, papi, papi.parameters);
    };
}
