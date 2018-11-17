import {
    GitProject,
    logger,
    MappedParameter,
    MappedParameters,
    menuForCommand,
    NoParameters,
    Parameters,
    Secret,
    SlackFileMessage } from "@atomist/automation-client";
import {
    CodeInspection,
    CodeInspectionRegistration,
    CommandHandlerRegistration,
    CommandListenerInvocation } from "@atomist/sdm";

import { SlackMessage } from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import { queryChatTeamById } from "../../adhoc/fingerprints";
import { mutatePreference, queryPreferences } from "../../adhoc/preferences";
import { footer } from "../../support/util";
import { ChooseTeamLibrary } from "./setLibraryGoal";

// ------------------------------
// show targets
// ------------------------------

const showTargets = async (cli: CommandListenerInvocation<NoParameters>) => {

    const sendMessage = (options: Array<{ text: string, value: string }>): Promise<void> => {
        const c: string = goals.renderOptions(options);
        logger.info(`content ${c}`);
        const message: SlackFileMessage = {
            content: c,
            fileType: "text",
            title: `Library Targets`,
        };
        return cli.addressChannels(message as SlackMessage);
    };

    return goals.withPreferences(
        queryPreferences(cli.context.graphClient),
        sendMessage,
    );
};

export const ShowTargets: CommandHandlerRegistration<NoParameters> = {
    name: "ShowTargets",
    description: "show the current targets",
    intent: "show targets",
    listener: showTargets,
};

// ------------------------------
// show goals
// ------------------------------

@Parameters()
export class ShowGoalsParameters {

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Secret("github://user_token?scopes=repo")
    public userToken: string;
}

const showGoals: CodeInspection<boolean, ShowGoalsParameters> = async (p, cli) => {

    const sendMessage = (text: string, options: Array<{ text: string, value: string }>): Promise<void> => {
        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Library Targets",
                    text,
                    color: "#00a5ff",
                    fallback: "Library Targets",
                    mrkdwn_in: ["text"],
                    actions: [
                        menuForCommand(
                            {
                                text: "Add a new target ...",
                                options,
                            },
                            ChooseTeamLibrary.name,
                            "library",
                            ),
                    ],
                    footer: footer(),
                },
            ],
        };
        return cli.addressChannels(message);
    };

    return goals.withProjectGoals(
        queryPreferences(cli.context.graphClient),
        (p as GitProject).baseDir,
        sendMessage,
    );
};

export const ShowGoals: CodeInspectionRegistration<boolean, ShowGoalsParameters> = {
    name: "LibraryImpactShowGoals",
    description: "show the current goals for this team",
    intent: "get library targets",
    paramsMaker: ShowGoalsParameters,
    inspection: showGoals,
};

// ------------------------------
// clear library targets
// ------------------------------

export const ClearLibraryTargets: CommandHandlerRegistration = {
    name: "ClearLibraryTargets",
    description: "reset all library targets for this team",
    intent: "clear library targets",
    listener: async cli => {
        const mutatePreferenceUpdate = mutatePreference(cli.context.graphClient);
        return queryChatTeamById(cli.context.graphClient, cli.context.workspaceId).then(
            chatTeamId => {
                return mutatePreferenceUpdate("atomist:fingerprints:clojure:project-deps", chatTeamId, "{}");
            },
        ).then(
            result => {
                return cli.addressChannels("successfully cleaned preferences");
            },
        ).catch(
            error => {
                return cli.addressChannels(`unable to clear library targets  ${error}`);
            },
        );
    },
};

export const DumpLibraryPreferences: CommandHandlerRegistration = {
    name: "DumpLibraryPreferences",
    description: "dump current prefs into a JSON file",
    intent: "dump preferences",
    listener: async cli => {
        const query = queryPreferences(cli.context.graphClient);
        return query()
        .then(
            result => {
                const message: SlackFileMessage = {
                    title: "library prefs",
                    content: goals.renderData(result),
                    fileType: "text",
                };
                return cli.addressChannels(message);
            },
        ).catch(
            error => {
                return cli.addressChannels(`unable to fetch preferences ${error}`);
            },
        );
    },
};
