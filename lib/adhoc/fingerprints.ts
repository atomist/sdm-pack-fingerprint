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
import {
    PushImpactListenerInvocation,
    SdmContext,
} from "@atomist/sdm";
import * as _ from "lodash";
import {
    Aspect,
    FP,
} from "../machine/Aspect";
import {
    aspectOf,
    displayName,
    displayValue,
} from "../machine/Aspects";
import {
    AddFingerprints,
    FindOtherRepos,
    GetFpByBranch,
    RepoBranchIds,
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
            return fp;
        } else {
            return {
                ...fp,
                displayValue: displayValue(aspectOf(fp, aspects), fp),
            };
        }
    };
}

function addDisplayName(aspects: Aspect[]): (fp: FP) => FP {
    return fp => {
        if (!!fp.displayName) {
            return fp;
        } else {
            return {
                ...fp,
                displayName: displayName(aspectOf(fp, aspects), fp),
            };
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

        const partitioned = _.groupBy(fps, "type");
        for (const type in partitioned) {
            const fp = partitioned[type].filter(a => !!a.name && !!a.sha)
                .map(addDisplayValue(aspects))
                .map(addDisplayName(aspects));

            await ctx.context.graphClient.mutate<AddFingerprints.Mutation, AddFingerprints.Variables>(
                {
                    name: "AddFingerprints",
                    variables: {
                        // Explicit mapping here to avoid more than needed
                        additions: fp.map(f => ({
                            type: f.type,
                            name: f.name,
                            data: typeof f.data !== "string" ? JSON.stringify(f.data) : f.data,
                            sha: f.sha,
                            displayName: f.displayName,
                            displayValue: f.displayValue,
                        })),
                        isDefaultBranch: (ids.Repo[0].defaultBranch === repoIdentification.branch),
                        type,
                        branchId: ids.Repo[0].branches[0].id,
                        repoId: ids.Repo[0].id,
                        sha: repoIdentification.sha,
                    },
                },
            );
        }
    } catch (ex) {
        logger.error(`Error sending fingerprints: ${ex.message}`);
    }

    return true;
};
