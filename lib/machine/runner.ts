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
import {
    renderData,
} from "@atomist/clj-editors";
import {
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import * as _ from "lodash";
import { sendFingerprintToAtomist } from "../adhoc/fingerprints";
import { getFPTargets } from "../adhoc/preferences";
import { votes } from "../checktarget/callbacks";
import { messageMaker } from "../checktarget/messageMaker";
import { GitCoordinate } from "../support/messages";
import { promiseAllSeq } from "../support/util";
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
    DefaultTransformPresentation,
    FingerprintImpactHandlerConfig,
    FingerprintOptions,
} from "./fingerprintSupport";

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
 * @param fp current Fingerprint
 * @param previous Fingeprint from Push.before (could be nil)
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

    const diffs = _.filter(_.map(fps, fp => {
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
    }), diff => !diff.from || diff.to.sha !== diff.from.sha);

    const selectedHandlers = _.filter(handlers, h => h.selector(fps[0]));

    const handlerVotes = _.flatten(await promiseAllSeq(_.map(selectedHandlers, async h => {
        const voats: Vote[] = [];
        if (h.diffHandler) {
            voats.push(...await h.diffHandler(i, diffs, aspect));
        }
        if (h.handler) {
            voats.push(...await h.handler(i, diffs, aspect));
        }
        return voats;
    })));

    if (aspect.workflows) {
        handlerVotes.push(... _.flatten(await promiseAllSeq(_.map(aspect.workflows, wf => {
            return wf(i, diffs, aspect);
        }))));
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

async function missingInfo(i: PushImpactListenerInvocation): Promise<MissingInfo> {

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
    } else {
        throw new Error(`PushImpactListenerInvocation missing providerId or push id.  Info not available.`);
    }
}

/**
 * Function that can compute fingerprints from a push
 */
export type FingerprintRunner = (i: PushImpactListenerInvocation) => Promise<FP[]>;

export type FingerprintComputer = (fingerprinters: Aspect[], p: Project) => Promise<FP[]>;

export const computeFingerprints: FingerprintComputer = async (fingerprinters, p) => {
    const allFps: FP[] = (await promiseAllSeq(
        fingerprinters.map(
            x => x.extract(p),
        ),
    )).reduce<FP[]>(
        (acc, fps) => {
            if (fps && !(fps instanceof Array)) {
                acc.push(fps);
                return acc;
            } else if (fps) {
                // TODO does concat return the larger array?
                return acc.concat(fps);
            } else {
                return acc;
            }
        },
        [],
    );

    const consolidatedFingerprints = await Promise.all(
        fingerprinters
            .filter(a => !!a.consolidate)
            .map(a => a.consolidate(extractedFingerprints)));

    return [...extractedFingerprints, ...consolidatedFingerprints];
};

/**
 * Construct our FingerprintRunner for the current registrations
 */
export function fingerprintRunner(
    fingerprinters: Aspect[],
    handlers: FingerprintHandler[],
    computer: (fingerprinters: Aspect[], p: Project) => Promise<FP[]>,
    options: FingerprintOptions & FingerprintImpactHandlerConfig = {
        aspects: [],
        transformPresentation: DefaultTransformPresentation,
        messageMaker,
    }): FingerprintRunner {

    const targetDiffBallot = votes(options);

    const tallyVotes = async (vts: Vote[], fingerprintHandlers: FingerprintHandler[], i: PushImpactListenerInvocation, info: MissingInfo) => {

        const coordinate: GitCoordinate = {
            owner: i.push.repo.owner,
            repo: i.push.repo.name,
            sha: i.push.after.sha,
            providerId: info.providerId,
            branch: i.push.branch,
        };

        return targetDiffBallot(
            i.context,
            vts,
            coordinate,
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
        logger.info(`Found ${Object.keys(previous).length} fingerprints`);

        const allFps = await computer(fingerprinters, p);

        logger.debug(`Prosessing fingerprints: ${renderData(allFps)}`);

        await sendFingerprintToAtomist(i, allFps, previous);

        try {
            const info = await missingInfo(i);
            const byType = _.groupBy(allFps, fp => fp.type);

            const allVotes = _.flatten(await promiseAllSeq(
                _.map(byType, (fps, type) => {
                    // aspect name is same as fingerprint type!
                    const fpAspect = fingerprinters.find(aspects => aspects.name === type);
                    return handleDiffs(fps, previous, info, handlers, fpAspect, i);
                }),
            ));
            logger.debug(`Votes:  ${renderData(allVotes)}`);
            await tallyVotes(allVotes, handlers, i, info);
        } catch (e) {
            logger.warn(`Not handling diffs (${e.message})`);
        }

        return allFps;
    };
}
