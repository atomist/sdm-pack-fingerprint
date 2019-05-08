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
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import {
    DeleteFpTarget,
    GetFpTargets,
    SetFpTarget,
} from "../typings/types";
import { FP } from "../../fingerprints";

/**
 * create a function that can query for a fingerprint target by name (team specific)
 * 
 * @param graphClient
 */
export async function getFPTargets(graphClient: GraphClient): Promise<GetFpTargets.Query> {
    const query: GetFpTargets.Query = await graphClient.query<GetFpTargets.Query, GetFpTargets.Variables>(
        {
            name: "GetFpTargets",
            options: QueryNoCacheOptions
        }
    );
    return query;
}

/**
 * the target fingerprint is stored as a json encoded string in the value of the TeamConfiguration
 * 
 * @param graphClient 
 * @param name 
 */
export async function queryPreferences(graphClient: GraphClient, name: string): Promise<FP> {
    const query: GetFpTargets.Query = await getFPTargets(graphClient);
    const config: GetFpTargets.TeamConfiguration = query.TeamConfiguration.find(x => x.name === name);
    return JSON.parse(config.value) as FP;
}

export function setFPTarget(graphClient: GraphClient): (name: string, value: string) => Promise<SetFpTarget.Mutation> {
    return (name, value) => {
        return graphClient.mutate<SetFpTarget.Mutation, SetFpTarget.Variables>(
            {
                name: "SetFpTarget",
                variables: {
                    name,
                    value,
                }
            }
        );
    }
}

export function deleteFPTarget(graphClient: GraphClient): (name: string) => Promise<SetFpTarget.Mutation> {
    return (name) => {
        return graphClient.mutate<DeleteFpTarget.Mutation, DeleteFpTarget.Variables>(
            {
                name: "DeleteFpTarget",
                variables: {
                    name
                }
            }
        );
    }
}
