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
import {
    GetAllFpsOnSha,
    GetFpTargets,
} from "../typings/types";
import {
    DiffContext,
    Feature,
    FingerprintHandler,
    FP,
    Vote,
} from "./Feature";
import { DefaultEditModeMaker } from "./fingerprintSupport";

/**
 * PushListenerImpactInvocations don't have this info and must be faulted in currently.  This is probably not ideal.
 */
interface MissingInfo {
    providerId: string;
    channel: string;
    targets: GetFpTargets.Query;
}

/**
 * Give each Feature the opportunity to evaluate the current FP, the previous FP, and any target FP
 *
 * @param fp current Fingerprint
 * @param previous Fingeprint from Push.before (could be nil)
 * @param info missing info
 * @param handlers deprecated handlers
 * @param feature parent Feature for this Fingerprint
 * @param i PushImpactListenerInvocation
 */
async function handleDiffs(
    fp: FP,
    previous: FP,
    info: MissingInfo,
    handlers: FingerprintHandler[],
    feature: Feature,
    i: PushImpactListenerInvocation): Promise<Vote[]> {

    const diff: DiffContext = {
        ...info,
        from: previous,
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
    let diffVotes: Vote[] = [];
    if (previous && fp.sha !== previous.sha) {
        diffVotes = await Promise.all(
            handlers
                .filter(h => h.diffHandler)
                .filter(h => h.selector(fp))
                .map(h => h.diffHandler(i, diff, feature)));
    }
    const currentVotes: Vote[] = await Promise.all(
        handlers
            .filter(h => h.handler)
            .filter(h => h.selector(fp))
            .map(h => h.handler(i, diff, feature)));

    let featureVotes: Vote[] = [];
    if (feature.workflows) {
        featureVotes = await Promise.all(feature.workflows.map(h => h(i, diff, feature)));
    }

    return [].concat(
        diffVotes,
        currentVotes,
        featureVotes,
    );
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
                record[fp.name] = {
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

/**
 * TODO Default PR generation style and message making for target diff handlers probably need to be configurable
 */
const targetDiffBallot = votes({
    transformPresentation: DefaultEditModeMaker,
    messageMaker,
});

/**
 * Delay handling Votes from Feature diff handlers until all of them are available so that
 * we can build Messages that can report on all target diffs
 *
 * @param vts votes from all of the Feature diff handlers
 * @param handlers deprecated external set of handlers
 * @param i PushImpactListenerInvocation
 * @param info missing info
 */
async function tallyVotes(vts: Vote[], handlers: FingerprintHandler[], i: PushImpactListenerInvocation, info: MissingInfo): Promise<void> {

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
                targets: { TeamConfiguration: [] },
            };
        }
    } else {
        throw new Error(`PushImpactListenerInvocation missing providerId or push id.  Info not available.`);
    }
}

export type FingerprintRunner = (i: PushImpactListenerInvocation) => Promise<FP[]>;

export type FingerprintComputer = (fingerprinters: Feature[], p: Project) => Promise<FP[]>;

export const computeFingerprints: FingerprintComputer = async (fingerprinters, p) => {

    const allFps: FP[] = (await Promise.all(
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
    return allFps;
};

/**
 * Construct our FingerprintRunner for the current registrations
 */
export function fingerprintRunner(
    fingerprinters: Feature[],
    handlers: FingerprintHandler[],
    computer: (fingerprinters: Feature[], p: Project) => Promise<FP[]>): FingerprintRunner {
    return async (i: PushImpactListenerInvocation) => {
        const p: Project = i.project;

        let previous: Record<string, FP> = {};

        if (!!i.push.before) {
            previous = await lastFingerprints(
                i.push.before.sha,
                i.context.graphClient);
        }
        logger.info(`Found ${Object.keys(previous).length} fingerprints`);

        const allFps: FP[] = await computer(fingerprinters, p);

        logger.debug(renderData(allFps));

        await sendFingerprintToAtomist(i, allFps, previous);

        try {
            const info = await missingInfo(i);
            const allVotes: Vote[] = (await Promise.all(
                allFps.map(fp => {
                    const fpFeature: Feature = fingerprinters.find(feature => feature.name === (fp.type || fp.name));
                    return handleDiffs(fp, previous[fp.name], info, handlers, fpFeature, i);
                }),
            )).reduce<Vote[]>(
                (acc, vts) => acc.concat(vts),
                [],
            );
            logger.debug(`Votes:  ${renderData(allVotes)}`);
            await tallyVotes(allVotes, handlers, i, info);
        } catch (e) {
            logger.warn(`Not handling diffs (${e.message})`);
        }

        return allFps;
    };
}
