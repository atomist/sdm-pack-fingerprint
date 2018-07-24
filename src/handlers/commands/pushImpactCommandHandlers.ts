import {MappedParameter, MappedParameters, Parameter, Parameters, Secret, Value} from "@atomist/automation-client";
import {CodeInspection, CodeInspectionRegistration, CommandHandlerRegistration, CommandListenerInvocation} from "@atomist/sdm";
import {ChatTeamPreferences, SetTeamPreference} from "../../typings/types";
import {SlackMessage} from "@atomist/slack-messages";
import * as goals from "@atomist/clj-editors";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {GraphClient} from "@atomist/automation-client/spi/graph/GraphClient";

@Parameters()
export class IgnoreVersionParameters {

    @Parameter({required: false, displayable: false})
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

    @Parameter({required: false, displayable: false})
    public msgId?: string;

    @Parameter({required: true})
    public name: string;

    @Parameter({required: true})
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

    @Parameter({required: false, displayable: false})
    public msgId?: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({required: true})
    public name: string;

    @Parameter({required: true})
    public version: string;
}

export function queryPreferences(graphClient: GraphClient): () => Promise<any> {
    return (): Promise<any> => {
        return graphClient.query<ChatTeamPreferences.Query, ChatTeamPreferences.Variables>(
            {name: "chat-team-preferences"}
        );
    };
}

function mutatePreference(graphClient: GraphClient): (chatTeamId: string, prefsAsJson: string) => Promise<any> {
    return (chatTeamId:string,prefsAsJson:string): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation,SetTeamPreference.Variables>(
            {name: "set-chat-team-preference",
             variables: {name: "atomist:fingerprints:clojure:project-deps",
                         value: prefsAsJson,
                         team: chatTeamId}},
        );
    };
}

function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return;
}

function setTeamLibraryGoal(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>) {
    return goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        {
            name: cli.parameters.name,
            version: cli.parameters.version
        }
    );
}

function confirmUpdate(cli: CommandListenerInvocation<ConfirmUpdateParameters>) {
    return;
}

async function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>) {
    return goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.library
    );
}

const showGoals: CodeInspection<void,ShowGoalsParameters> = async (p, cli) => {

    function sendMessage(text: string, options: { text: string, value: string }[]): Promise<void> {
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
                                options
                            },
                            LibraryImpactChooseTeamLibrary,
                            "library")
                    ],
                }
            ]
        };
        return cli.addressChannels(message);
    };

    return goals.withProjectGoals(
        queryPreferences(cli.context.graphClient),
        p,
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

    // TODO this one has name and version in the parameter value
    library: string;
}

// TODO how does type checking help us when we're referencing this from an Action above?
export const LibraryImpactChooseTeamLibrary: CommandHandlerRegistration<ChooseTeamLibraryGoalParameters> = {
    name: "LibraryImpactChooseTeamLibrary",
    description: "set library target using version in current project",
    parameters: {
        msgId: {required: false, displayable: false},
        library: {},
    },
    listener: chooseTeamLibraryGoal,
};

export const ConfirmUpdate: CommandHandlerRegistration<ConfirmUpdateParameters> = {
    name: "LibraryImpactConfirmUpdate",
    description: "choose to raise a PR on the current project for a library version update",
    paramsMaker: ConfirmUpdateParameters,
    listener: async cli => confirmUpdate(cli),
};

export const ShowGoals: CodeInspectionRegistration<void,ShowGoalsParameters> = {
    name: "LibraryImpactShowGoals",
    description: "show the current goals for this team",
    intent: "get library targets",
    paramsMaker: ShowGoalsParameters,
    inspection: showGoals,
};
