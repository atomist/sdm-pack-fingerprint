import {
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    Secret,
    Value,
    logger,
    Success,
    Success,
} from "@atomist/automation-client";
import { GraphClient, QueryNoCacheOptions } from "@atomist/automation-client/spi/graph/GraphClient";
import { menuForCommand, buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import * as goals from "@atomist/clj-editors";
import {
    CodeInspection,
    CodeInspectionRegistration,
    CommandHandlerRegistration,
    CommandListenerInvocation,
    CodeTransformRegistration,
    CodeTransform,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import {
    ChatTeamPreferences,
    SetTeamPreference,
    FindLinkedReposWithFingerprint,
} from "../../typings/types";
import { GitProject } from "../../../node_modules/@atomist/automation-client/project/git/GitProject";

@Parameters()
export class IgnoreVersionParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Value("name")
    public name: string;

    @Value("version")
    public version: string;
}

@Parameters()
export class SetTeamLibraryGoalParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true })
    public name: string;

    @Parameter({ required: true })
    public version: string;
}

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

@Parameters()
export class ConfirmUpdateParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: true })
    public name: string;

    @Parameter({ required: true })
    public version: string;
}

export function queryPreferences(graphClient: GraphClient): () => Promise<any> {
    return () => {
        return graphClient.query<ChatTeamPreferences.Query, ChatTeamPreferences.Variables>(
            { name: "chat-team-preferences", options: QueryNoCacheOptions },
        );
    };
}

function queryFingerprints(graphClient: GraphClient): (name: string) => Promise<any> {
    return name => {
        return graphClient.query<FindLinkedReposWithFingerprint.Query, FindLinkedReposWithFingerprint.Variables>(
            {
                name: "find-linked-repos-with-fingerprint", 
                options: QueryNoCacheOptions,
                variables: {
                    name
                }
            },
        )
    }
}

function mutatePreference(graphClient: GraphClient): (chatTeamId: string, prefsAsJson: string) => Promise<any> {
    return (chatTeamId, prefsAsJson): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation, SetTeamPreference.Variables>(
            {
                name: "set-chat-team-preference",
                variables: {
                    name: "atomist:fingerprints:clojure:project-deps",
                    value: prefsAsJson,
                    team: chatTeamId,
                },
            },
        );
    };
}

function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return cli.addressChannels("TODO");
}

function askAboutBroadcast(cli: CommandListenerInvocation, name: string, version: string) {
    cli.addressChannels(
        {attachments: 
            [{
                text: `Shall we nudge everyone with a PR for ${name}/${version}`,
                fallback: "none",
                actions: [
                    buttonForCommand({text: "broadcast"}, BroadcastNudge.name, {name, version}),
                ]
            }]
        }
    );
}

function broadcastNudge(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>): Promise<any> {
    return goals.broadcast(
        queryFingerprints(cli.context.graphClient),
        {name: cli.parameters.name,
         version: cli.parameters.version},
        (owner: string, repo: string, channel: string) => {
            const message: SlackMessage = {
                attachments: [
                    {
                        text: `Can we help you upgrade the version of ${cli.parameters.name} to ${cli.parameters.version}`,
                        fallback: "none",
                        actions: [
                            buttonForCommand(
                                {
                                    text: "create PR",                                    
                                },
                                ConfirmUpdate.name,
                                {
                                    name: cli.parameters.name,
                                    version: cli.parameters.version
                                }
                            )
                        ]
                    }
                ]
            };
            return cli.context.messageClient.addressChannels(message,channel);
        }
    );
}

function setTeamLibraryGoal(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>) {
    goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        {
            name: cli.parameters.name,
            version: cli.parameters.version,
        },
    );
    askAboutBroadcast( cli, cli.parameters.name, cli.parameters.version);
}

async function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>) {
    goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.library,
    );
    const args: string[] = cli.parameters.library.split(':');
    askAboutBroadcast( cli, args[0], args[1]);
}

const confirmUpdate: CodeTransform<ConfirmUpdateParameters> = async (p, cli) => {
    await cli.addressChannels(`make an edit to the project in ${(p as GitProject).baseDir} to go to version ${cli.parameters.version}`);
    goals.edit((p as GitProject).baseDir,cli.parameters.name,cli.parameters.version);
    const message: SlackMessage = {
        attachments: [
            {text: `Setting version *${cli.parameters.name}:${cli.parameters.version}* in <https://github.com/${cli.parameters.owner}/${cli.parameters.repo}|${cli.parameters.owner}/${cli.parameters.repo}> :heart_eyes:`,
             mrkdwn_in: ["text"],
             color: "#45B254",
             fallback: "none"},
        ]
    };
    await cli.addressChannels(message);
    return p;
}

const showGoals: CodeInspection<void, ShowGoalsParameters> = async (p, cli) => {

    const sendMessage = (text: string, options: { text: string, value: string }[]): Promise<void> => {
        const message: SlackMessage = {
            attachments: [
                {
                    text,
                    color: "#00a5ff",
                    fallback: "none",
                    mrkdwn_in: ["text"],
                    actions: [
                        menuForCommand(
                            {
                                text: "Add a new target ...",
                                options,
                            },
                            ChooseTeamLibrary.name,
                            "library"),
                    ],
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

export const IgnoreVersion: CommandHandlerRegistration<IgnoreVersionParameters> = {
    name: "LibraryImpactIgnoreVersion",
    description: "Allow a Project to skip one version of library goal",
    paramsMaker: IgnoreVersionParameters,
    listener: async cli => ignoreVersion(cli),
};

export const SetTeamLibrary: CommandHandlerRegistration<SetTeamLibraryGoalParameters> = {
    name: "LibraryImpactSetTeamLibrary",
    intent: "set library target",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: SetTeamLibraryGoalParameters,
    listener: async cli => setTeamLibraryGoal(cli),
};

export interface ChooseTeamLibraryGoalParameters {

    msgId?: string;

    library: string;
}

export const ChooseTeamLibrary: CommandHandlerRegistration<ChooseTeamLibraryGoalParameters> = {
    name: "LibraryImpactChooseTeamLibrary",
    description: "set library target using version in current project",
    parameters: {
        msgId: { required: false, displayable: false },
        library: {},
    },
    listener: chooseTeamLibraryGoal,
};

export const ConfirmUpdate: CodeTransformRegistration<ConfirmUpdateParameters> = {
    name: "LibraryImpactConfirmUpdate",
    description: "choose to raise a PR on the current project for a library version update",
    paramsMaker: ConfirmUpdateParameters,
    transform: confirmUpdate,
};

export const ShowGoals: CodeInspectionRegistration<void,ShowGoalsParameters> = {
    name: "LibraryImpactShowGoals",
    description: "show the current goals for this team",
    intent: "get library targets",
    paramsMaker: ShowGoalsParameters,
    inspection: showGoals,
};

export const BroadcastNudge: CommandHandlerRegistration<SetTeamLibraryGoalParameters> = {
    name: "BroadcastNudge",
    description: "message all Channels linked to Repos that contain a library",
    paramsMaker: SetTeamLibraryGoalParameters,
    listener: broadcastNudge,
};
