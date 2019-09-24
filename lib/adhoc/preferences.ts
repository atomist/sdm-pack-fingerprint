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
    addressEvent,
    GraphClient,
    HandlerContext,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import {
    PreferenceScope,
    PushImpactListenerInvocation,
} from "@atomist/sdm";
import { FP } from "../machine/Aspect";
import { PolicyTargets } from "../typings/types";

export function toName(type: string, name: string): string {
    return `${type}::${name}`;
}

export function fromName(targetName: string): { type: string, name: string } {
    const regex = new RegExp("(.*?)::(.*)");
    const data = regex.exec(targetName);
    if (data) {
        return {
            type: data[1],
            name: data[2],
        };
    } else {
        throw new Error(`invalid targetName ${targetName}`);
    }
}

export async function getFPTargets(ctx: HandlerContext, type?: string, name?: string): Promise<PolicyTargets.PolicyTarget[]> {
    const result = await ctx.graphClient.query<PolicyTargets.Query, PolicyTargets.Variables>({
        name: "PolicyTargets",
        variables: {
            type: !!type ? [type] : undefined,
            name: !!name ? [name] : undefined,
        },
        options: QueryNoCacheOptions,
    });

    return result.PolicyTarget;
}

export async function getRepoStream(pli: PushImpactListenerInvocation): Promise<string | undefined> {
    const { owner, name } = pli.push.repo;
    const branchStream = await pli.preferences.get<{ name: string }>(
        `atomist.com/aspect/stream/${owner}/${name}/${pli.push.branch}`,
        { scope: PreferenceScope.Workspace });
    if (!!branchStream && !!branchStream.name) {
        return branchStream.name;
    }
    const repoStream = await pli.preferences.get<{ name: string }>(
        `atomist.com/aspect/stream/${owner}/${name}`,
        { scope: PreferenceScope.Workspace });
    if (!!repoStream && !!repoStream.name) {
        return repoStream.name;
    }
    const orgStream = await pli.preferences.get<{ name: string }>(
        `atomist.com/aspect/stream/${owner}`,
        { scope: PreferenceScope.Workspace });
    if (!!orgStream && !!orgStream.name) {
        return orgStream.name;
    }

    return undefined;
}

export async function setFPTarget(ctx: HandlerContext, fp: FP<any>, stream?: string): Promise<void> {
    const target: PolicyTargets.PolicyTarget = {
        ...fp,
        stream,
    };
    await ctx.messageClient.send(target, addressEvent("PolicyTarget"));
}

export function deleteFPTarget(graphClient: GraphClient): (type: string, name: string) => Promise<void> {
    return (type, name) => {
        // TODO delete target
        return {} as any;
    };
}
