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
    FP,
    renderData,
    Vote,
} from "@atomist/clj-editors";
import {
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import * as _ from "lodash";
import { sendFingerprintToAtomist } from "../adhoc/fingerprints";
import { getFPTargets } from "../adhoc/preferences";
import {
    GetAllFpsOnSha,
    GetFpTargets,
    GetPushDetails,
} from "../typings/types";
import {
    DiffContext,
    Feature,
    FingerprintHandler,
} from "./Feature";

interface MissingInfo {
    providerId: string;
    channel: string;
    targets: GetFpTargets.Query;
}

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

    const featureVotes: Vote[] = await Promise.all(
        feature.workflows.map(h => h(i, diff, feature)),
    );

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

async function tallyVotes(vts: Vote[], handlers: FingerprintHandler[], i: PushImpactListenerInvocation, info: MissingInfo): Promise<void> {
    await Promise.all(
        handlers.map(async h => {
            if (h.ballot) {
                await h.ballot(
                    i.context,
                    vts,
                    {
                        owner: i.push.repo.owner,
                        repo: i.push.repo.name,
                        sha: i.push.after.sha,
                        providerId: info.providerId,
                        branch: i.push.branch,
                    },
                    info.channel,
                );
            }
        },
        ),
    );
}

async function missingInfo(i: PushImpactListenerInvocation): Promise<MissingInfo> {
    const results: GetPushDetails.Query = await i.context.graphClient.query<GetPushDetails.Query, GetPushDetails.Variables>(
        {
            name: "GetPushDetails",
            options: QueryNoCacheOptions,
            variables: {
                id: i.push.id,
            },
        });
    const targets = await getFPTargets(i.context.graphClient);
    return {
        providerId: results.Push[0].repo.org.scmProvider.providerId,
        channel: _.get(results, "Push[0].repo.channels[0].name"),
        targets,
    };
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
                logger.warn(`extractor returned something weird ${JSON.stringify(fps)}`);
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
        const info: MissingInfo = await missingInfo(i);
        logger.info(`Missing Info:  ${JSON.stringify(info)}`);

        let previous: Record<string, FP> = {};

        if (!!i.push.before) {
            previous = await lastFingerprints(
                i.push.before.sha,
                i.context.graphClient);
        }
        logger.info(`Found ${Object.keys(previous).length} fingerprints`);

        const allFps: FP[] = await computer(fingerprinters, p);

        logger.debug(renderData(allFps));

        await sendFingerprintToAtomist(i, allFps);

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

        return allFps;
    };
}
