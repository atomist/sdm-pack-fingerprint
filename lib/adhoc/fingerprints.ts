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
    QueryNoCacheOptions,
    RepoRef,
} from "@atomist/automation-client";
import { partitionByFeature } from "@atomist/clj-editors";
import {
    PushImpactListenerInvocation,
    SdmContext,
} from "@atomist/sdm";
import { Aspect, FP } from "../machine/Aspect";
import { aspectOf, displayValue, displayName } from "../machine/Aspects";
import {
    AddFingerprints,
    FindOtherRepos,
    GetFpByBranch,
    RepoBranchIds,
    FingerprintInput,
} from "../typings/types";

// TODO this is not actually using the new query yet (filtering is happening in memory)
export function findTaggedRepos(graphClient: GraphClient): (type: string, name: string) => Promise<FindOtherRepos.Query> {
    return async (type, name) => {
        return graphClient.query<FindOtherRepos.Query, FindOtherRepos.Variables>(
            {
                name: "FindOtherRepos",
                options: QueryNoCacheOptions,
                variables: {
                    type,
                    name,
                },
            },
        );
    };
}

/**
 * uses GetFpByBranch query
 *
 * @param graphClient
 */
export function queryFingerprintsByBranchRef(graphClient: GraphClient):
    (repo: string, owner: string, branch: string) => Promise<GetFpByBranch.Analysis[]> {

    return async (repo, owner, branch) => {
        const query: GetFpByBranch.Query = await graphClient.query<GetFpByBranch.Query, GetFpByBranch.Variables>({
            name: "GetFpByBranch",
            options: QueryNoCacheOptions,
            variables: {
                owner,
                repo,
                branch,
            },
        });
        return query.Repo[0].branches[0].commit.analysis;
    };
}

/**
 * Do something with fingerprints. Normally, send them to Atomist
 */
export type PublishFingerprints = (i: PushImpactListenerInvocation, aspects: Aspect[], fps: FP[], previous: Record<string, FP>) => Promise<boolean>;

export const sendFingerprintsToAtomist: PublishFingerprints = async (i, aspects, fps, previous) => {
    return sendFingerprintsToAtomistFor(
        i,
        aspects,
        {
            branch: i.push.branch,
            owner: i.push.repo.owner,
            repo: i.push.repo.name,
            sha: i.push.after.sha,
        },
        fps,
        previous);
};

export type RepoIdentification = Required<Pick<RepoRef, "owner" | "repo" | "branch" | "sha">>;

/**
 * Do something for fingerprints for the latest commit to the given repo
 */
export type PublishFingerprintsFor = (
    ctx: SdmContext,
    aspects: Aspect[],
    repoRef: RepoIdentification,
    fps: FP[], previous: Record<string, FP>) => Promise<boolean>;

function addDisplayValue(aspects: Aspect[]): (fp: FP) => FP {
    return fp => {
        if (!!fp.displayValue) {
            return {
                ...fp,
                displayValue: displayValue(aspectOf(fp, aspects), fp),
            };
        } else {
            return fp;
        }
    };
}

function addDisplayName(aspects: Aspect[]): (fp: FP) => FP {
    return fp => {
        if (!!fp.displayName) {
            return {
                ...fp,
                displayName: displayName(aspectOf(fp, aspects), fp),
            };
        } else {
            return fp;
        }
    };
}

export const sendFingerprintsToAtomistFor: PublishFingerprintsFor = async (ctx, aspects, repoIdentification, fps, previous) => {
    try {
        const ids: RepoBranchIds.Query = await ctx.context.graphClient.query<RepoBranchIds.Query, RepoBranchIds.Variables>(
            {
                name: "RepoBranchIds",
                variables: repoIdentification,
            },
        );

        await partitionByFeature(fps.map(addDisplayValue(aspects)).map(addDisplayName(aspects)), async partitioned => {
            for (const { type, additions } of partitioned) {
                logger.info(`Upload ${additions.length} fingerprints of type ${type}`);
                await ctx.context.graphClient.mutate<AddFingerprints.Mutation, AddFingerprints.Variables>(
                    {
                        name: "AddFingerprints",
                        variables: {
                            additions: additions.filter(a => !!a.name && !!a.sha),
                            isDefaultBranch: (ids.Repo[0].defaultBranch === repoIdentification.branch),
                            type,
                            branchId: ids.Repo[0].branches[0].id,
                            repoId: ids.Repo[0].id,
                            sha: repoIdentification.sha,
                        },
                    },
                );
            }
        });
    } catch (ex) {
        logger.error(`Error sending fingerprints: ${ex.message}`);
    }

    return true;
};
