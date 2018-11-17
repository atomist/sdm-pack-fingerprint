import { GraphClient, QueryNoCacheOptions } from "@atomist/automation-client";
import { ChatTeamPreferences, SetTeamPreference } from "../typings/types";

// TODO this assumes one ChatTeam per graphql endpoint - the whole preference model will move to a custom type
export function queryPreferences(graphClient: GraphClient): () => Promise<any> {
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
