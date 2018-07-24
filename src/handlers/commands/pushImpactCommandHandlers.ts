import {
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    Secret,
    Value,
} from "@atomist/automation-client";
import { GraphClient } from "@atomist/automation-client/spi/graph/GraphClient";
import { menuForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import * as goals from "@atomist/clj-editors";
import {
    CodeInspection,
    CodeInspectionRegistration,
    CommandHandlerRegistration,
    CommandListenerInvocation,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import {
    ChatTeamPreferences,
    SetTeamPreference,
} from "../../typings/types";

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
            { name: "chat-team-preferences" },
        );
    };
}

function mutatePreference(graphClient: GraphClient): (chatTeamId: string, prefsAsJson: string) => Promise<any> {
<<<<<<< HEAD
    return (chatTeamId:string,prefsAsJson:string): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation,SetTeamPreference.Variables>(
            {name: "set-chat-team-preference",
             variables: {name: "atomist:fingerprints:clojure:project-deps",
                         value: prefsAsJson,
                         team: chatTeamId}},
=======
    // TODO mutate and query don't stop you from parameterizing the functions with the wrong type
    // TODO mutations can be in the wrong place - folder conventions are relevant
    // TODO and it just plain doesn't work - where is the correlation-id in my logs!
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
>>>>>>> Polish
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
            version: cli.parameters.version,
        },
    );
}

function confirmUpdate(cli: CommandListenerInvocation<ConfirmUpdateParameters>) {
    return;
}

async function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>) {
    return goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.library,
    );
}

const showGoals: CodeInspection<void,ShowGoalsParameters> = async (p, cli) => {

<<<<<<< HEAD
    function sendMessage(text: string, options: { text: string, value: string }[]): Promise<void> {
=======
    // TODO selection is rendering but callback is not working
    // TODO passing a string works but is not right.  passing the type doesn't work
    // do you need the handler, instead of the registration?
    const sendMessage = (text: string, options: { text: string, value: string }[]): Promise<void> => {
>>>>>>> Polish
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
                            LibraryImpactChooseTeamLibrary.name,
                            "library"),
                    ],
                },
            ],
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
        msgId: { required: false, displayable: false },
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
