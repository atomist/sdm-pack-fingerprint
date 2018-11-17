import { GraphClient, QueryNoCacheOptions } from "@atomist/automation-client";
import { ChatTeamById, FindLinkedReposWithFingerprint, GetFingerprintBySha } from "../typings/types";

export const queryChatTeamById = async (graphClient: GraphClient, teamid: string): Promise<string> => {
    return graphClient.query<ChatTeamById.Query, ChatTeamById.Variables>(
        {
            name: "chatTeamById",
            variables: { id: teamid },
        },
    ).then(
        result => {
            return result.Team[0].chatTeams[0].id;
        },
    );
};

export function queryFingerprints(graphClient: GraphClient): (name: string) => Promise<any> {
    return async name => {
        return graphClient.query<FindLinkedReposWithFingerprint.Query, FindLinkedReposWithFingerprint.Variables>(
            {
                name: "findLinkedReposWithFingerprint",
                options: QueryNoCacheOptions,
                variables: {
                    name,
                },
            },
        );
    };
}

export function queryFingerprintBySha(graphClient: GraphClient): (name: string, sha: string) => Promise<any> {
    return async (name, sha) => {
        return graphClient.query<GetFingerprintBySha.Query, GetFingerprintBySha.Variables>(
            {
                name: "get-fingerprint-by-sha",
                options: QueryNoCacheOptions,
                variables: {
                    name,
                    sha,
                },
            },
        );
    };
}
