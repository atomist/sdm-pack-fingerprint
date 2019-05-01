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
    ChatTeamPreferences,
    SetTeamPreference,
    SetFpTarget,
    GetFpTargets,
} from "../typings/types";

// TODO this assumes one ChatTeam per graphql endpoint - the whole preference model will move to a custom type
export function queryPreferences(graphClient: GraphClient): () => Promise<ChatTeamPreferences.Query> {
    return () => {
        return graphClient.query<ChatTeamPreferences.Query, ChatTeamPreferences.Variables>(
            { name: "chatTeamPreferences", options: QueryNoCacheOptions },
        );
    };
}

export function mutateIgnores(graphClient: GraphClient): (chatTeamId: string, prefsAsJson: string) => Promise<any> {
    return (chatTeamId, prefsAsJson): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation, SetTeamPreference.Variables>(
            {
                name: "setTeamPreference",
                variables: {
                    name: "fingerprints.deps.ignore",
                    value: prefsAsJson,
                    team: chatTeamId,
                },
            },
        );
    };
}

export function mutatePreference(graphClient: GraphClient): (prefName: string, chatTeamId: string, prefsAsJson: string) => Promise<any> {
    return (prefName: string, chatTeamId, prefsAsJson): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation, SetTeamPreference.Variables>(
            {
                name: "setTeamPreference",
                variables: {
                    name: prefName,
                    value: prefsAsJson,
                    team: chatTeamId,
                },
            },
        );
    };
}

/**
 * create a function that can query for a fingerprint target by name (team specific)
 * 
 * @param graphClient 
 */
export function getFPTarget(graphClient: GraphClient): (name: string) => Promise<GetFpTargets.Query> {
    return (name) => {
        return graphClient.query<GetFpTargets.Query, GetFpTargets.Variables>(
            { name: "GetFpTarget", options: QueryNoCacheOptions, variables: { name } }
        );
    }
}

export function setFPTarget(graphClient: GraphClient): (name: string, value: string) => Promise<SetFpTarget.Mutation> {
    return (name, value) => {
        return graphClient.query<SetFpTarget.Mutation, SetFpTarget.Variables>(
            { name: "SetFpTarget", options: QueryNoCacheOptions, variables: { name, value } }
        );
    }
}
