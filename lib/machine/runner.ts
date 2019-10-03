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
    GraphClient,
    logger,
    Project,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import {PushImpactListenerInvocation} from "@atomist/sdm";
import {toArray} from "@atomist/sdm-core/lib/util/misc/array";
import * as _ from "lodash";
import {PublishFingerprints} from "../adhoc/fingerprints";
import {
    getFPTargets,
} from "../adhoc/preferences";
import {votes} from "../checktarget/callbacks";
import {messageMaker} from "../checktarget/messageMaker";
import {makeVirtualProjectAware} from "../fingerprints/virtual-project/makeVirtualProjectAware";
import {VirtualProjectFinder} from "../fingerprints/virtual-project/VirtualProjectFinder";
import {
    GetAllFpsOnSha,
    GetFpTargets,
} from "../typings/types";
import {
    Aspect,
    DiffContext,
    FingerprintHandler,
    FP,
    Vote,
} from "./Aspect";
import {
    AspectsFactory,
    DefaultTransformPresentation,
    FingerprintImpactHandlerConfig,
    FingerprintOptions,
} from "./fingerprintSupport";
import {fingerprintOf} from "../adhoc/construct";

/**
 * PushListenerImpactInvocations don't have this info and must be faulted in currently.  This is probably not ideal.
 */
interface MissingInfo {
    providerId: string;
    channel: string;
    targets: GetFpTargets.Query;
}

/**
 * Give each Aspect the opportunity to evaluate the current FP, the previous FP, and any target FP
 *
 * @param fps current fingerprints
 * @param previous Fingerprint from Push.before (could be nil)
 * @param info missing info
 * @param handlers deprecated handlers
 * @param aspect parent Aspect for this Fingerprint
 * @param i PushImpactListenerInvocation
 */
async function handleDiffs(
    fps: FP[],
    previous: Record<string, FP>,
    info: MissingInfo,
    handlers: FingerprintHandler[],
    aspect: Aspect,
    i: PushImpactListenerInvocation): Promise<Vote[]> {

    if (!fps || fps.length < 1) {
        return [];
    }

    const diffs = fps.map(fp => {
        const from = previous[`${fp.type}::${fp.name}`];
        const diff: DiffContext = {
            ...info,
            from,
            to: fp,
            branch: i.push.branch,
            owner: i.push.repo.owner,
            repo: i.push.repo.name,
            sha: i.push.after.sha,
            data: {
                from: [],
                to: [],
            },
        };
        return diff;
    });

    const selectedHandlers = handlers.filter(h => h.selector(fps[0]));

    const handlerVotes: Vote[] = [];
    for (const h of selectedHandlers) {
        if (h.diffHandler) {
            handlerVotes.push(...await h.diffHandler(i, diffs, aspect));
        }
        if (h.handler) {
            handlerVotes.push(...await h.handler(i, diffs, aspect));
        }
    }

    if (aspect && aspect.workflows) {
        for (const wf of aspect.workflows) {
            try {
                handlerVotes.push(...(await wf(i, diffs, aspect) || []));
            } catch (e) {
                logger.warn(`Aspect workflow failed: ${e.message}`);
            }
        }
    }

    return handlerVotes;
}

async function lastFingerprints(sha: string, graphClient: GraphClient): Promise<Record<string, FP>> {
    // TODO what about empty queries, and missing fingerprints on previous commit
    const results: GetAllFpsOnSha.Query = await graphClient.query<GetAllFpsOnSha.Query, GetAllFpsOnSha.Variables>(
        {
            name: "GetAllFpsOnSha",
            options: QueryNoCacheOptions,
            variables: {
                sha,
            },
        },
    );
    if (!results || !results.Commit) {
        return {};
    }
    return results.Commit[0].analysis.reduce<Record<string, FP>>(
        (record: Record<string, FP>, fp: GetAllFpsOnSha.Analysis) => {
            if (fp.name) {
                record[`${fp.type}::${fp.name}`] = {
                    sha: fp.sha,
                    data: JSON.parse(fp.data),
                    name: fp.name,
                    type: fp.type,
                    version: "1.0",
                    abbreviation: "abbrev",
                };
            }
            return record;
        },
        {});
}

async function missingInfo(i: PushImpactListenerInvocation): Promise<MissingInfo | undefined> {

    const info = {
        providerId: _.get(i, "push.repo.org.provider.providerId"),
        channel: _.get(i, "push.repo.channels[0].name"),
    };

    if (!!info.providerId && !!i.push.id) {
        try {
            const targets = await getFPTargets(i.context.graphClient);

            return {
                ...info,
                targets,
            };
        } catch (e) {
            return {
                ...info,
                targets: {TeamConfiguration: []},
            };
        }
    }
    return undefined;
}

export type FingerprintRunner = (i: PushImpactListenerInvocation) => Promise<FP[]>;

export type FingerprintComputer = (p: Project, i: PushImpactListenerInvocation) => Promise<FP[]>;

export function createFingerprintComputer(
    aspects: Aspect[],
    virtualProjectFinder?: VirtualProjectFinder,
    aspectsFactory?: AspectsFactory): FingerprintComputer {
    return async (p, i) => {
        const extracted: FP[] = [];
        const allAspects = [...aspects];
        if (virtualProjectFinder) {
            // Seed the VirtualProjectFinder, which may need to cache
            await virtualProjectFinder.findVirtualProjectInfo(p);
        }

        if (aspectsFactory) {
            const dynamicAspects = await aspectsFactory(p, i, aspects) || [];
            if (virtualProjectFinder) {
                dynamicAspects.forEach(da => makeVirtualProjectAware(da, virtualProjectFinder));
            }
            allAspects.push(...dynamicAspects);
        }

        const vetoAspects = allAspects.filter(a => !!a.vetoWhen);
        const otherAspects = allAspects.filter(a => !a.vetoWhen);

        for (const vetoAspect of vetoAspects) {
            const fps = toArray(await vetoAspect.extract(p, i));
            if (!!fps) {
                extracted.push(...fps);
            }
            const vetoResult = vetoAspect.vetoWhen(fps);
            if (vetoResult) {
                logger.info("Fingerprinting was vetoed: %j", vetoResult);
                extracted.push(fingerprintOf({
                    type: "veto", data: {
                        ...vetoResult,
                        vetoingAspectName: vetoAspect.name,
                    },
                }));
                return extracted;
            }
        }

        for (const otherAspect of otherAspects) {
            try {
                const fps = toArray(await otherAspect.extract(p, i));
                if (!!fps) {
                    extracted.push(...fps);
                }
            } catch (e) {
                logger.warn(`Aspect '${otherAspect.name}' extract failed: ${e.message}`);
            }
        }

        for (const cfp of allAspects.filter(f => !!f.consolidate)) {
            try {
                const consolidated: FP[] = toArray(await cfp.consolidate(extracted, p, i));
                extracted.push(...consolidated);
            } catch (e) {
                logger.warn(`Aspect '${cfp.name}' consolidate failed: ${e.message}`);
            }
        }
        return extracted;
    };
}

/**
 * Construct our FingerprintRunner for the current registrations
 */
export function fingerprintRunner(
    aspects: Aspect[],
    handlers: FingerprintHandler[],
    computer: FingerprintComputer,
    publishFingerprints: PublishFingerprints,
    options: FingerprintOptions & FingerprintImpactHandlerConfig = {
        aspects: [],
        transformPresentation: DefaultTransformPresentation,
        messageMaker,
    }): FingerprintRunner {
    const targetDiffBallot = votes(options);

    const tallyVotes = async (vts: Vote[], fingerprintHandlers: FingerprintHandler[], i: PushImpactListenerInvocation, info: MissingInfo) => {
        return targetDiffBallot(
            i,
            vts,
            info.channel);
    };

    return async (i: PushImpactListenerInvocation) => {
        const p = i.project;

        let previous: Record<string, FP> = {};

        if (!!i.push.before) {
            previous = await lastFingerprints(
                i.push.before.sha,
                i.context.graphClient);
        }

        const allFps = await computer(p, i);
        await publishFingerprints(i, aspects, allFps, previous);

        try {

            const allAspects = [...aspects];
            if (!!options && options.aspectsFactory) {
                const dynamicAspects = await options.aspectsFactory(p, i, aspects) || [];
                allAspects.push(...dynamicAspects);
            }

            const info = await missingInfo(i);
            if (!!info) {
                const byType = _.groupBy(allFps, fp => fp.type);

                const allVotes: Vote[] = [];
                for (const [type, fps] of Object.entries(byType)) {
                    const fpAspect = allAspects.find(a => a.name === type);
                    allVotes.push(...(await handleDiffs(fps, previous, info, handlers, fpAspect, i) || []));
                }

                await tallyVotes(allVotes, handlers, i, info);
            }
        } catch (e) {
            logger.warn(`Not handling diffs (${e.message})`);
        }

        return allFps;
    };
}
