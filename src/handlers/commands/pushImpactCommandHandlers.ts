import { Parameters, Parameter, MappedParameter, Value, MappedParameters, Secret, logger } from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";
import { ChatTeamPreferences, SetTeamPreference } from "../../typings/types";
import { SlackMessage } from "@atomist/slack-messages";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { RemoteRepoRef, ProviderType } from "../../../node_modules/@atomist/automation-client/operations/common/RepoId";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { menuForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { GraphClient } from "@atomist/automation-client/spi/graph/GraphClient";
import { listCommitsBetween } from "@atomist/sdm-core/util/github/ghub";
import { ProjectOperationCredentials } from "@atomist/automation-client/operations/common/ProjectOperationCredentials";
import * as _ from "lodash";
import * as goals from "@atomist/clj-editors";

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

    @Parameter({required: true})
    public name: string;

    @Parameter({required: true})
    public version: string;
}

@Parameters()
export class ChooseTeamLibraryGoalParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    // TODO this one has name and version in the parameter value
    @Parameter({required: true})
    public library: string;
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

    @Parameter({required: true})
    public name: string;
    
    @Parameter({required: true})
    public version: string;
}

export function queryPreferences(graphClient: GraphClient): () => Promise<any> {
    return (): Promise<any> => {
        return graphClient.query<ChatTeamPreferences.Query,ChatTeamPreferences.Variables>(
            {name: "chat-team-preferences"}
        ).then(result => {
            return result;
        }
    )};
}

function mutatePreference(graphClient: GraphClient): (chatTeamId: string, prefsAsJson: string) => Promise<any> {
    return (chatTeamId:string,prefsAsJson:string): Promise<any> => {
        return graphClient.mutate<SetTeamPreference.Mutation,SetTeamPreference.Variables>(
            {name: "set-chat-team-preference",
             variables: {name: "atomist:fingerprints:clojure:project-deps",
                         value: prefsAsJson,
                         team: chatTeamId}},
        ).then(result => {
            return result;
        })
    };
}
function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return;
}

function setTeamLibraryGoal(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>) {
    return goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        {name: cli.parameters.name,
         version: cli.parameters.version}
    );
}

function confirmUpdate(cli: CommandListenerInvocation<ConfirmUpdateParameters>) {
    return;
}

function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>) {
    return goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.library
    );
}

function showGoals(cli: CommandListenerInvocation<ShowGoalsParameters>) {

    function cloneRepo(): Promise<String> {
        return GitCommandGitProject.cloned(
            {token: cli.parameters.userToken},
            new GitHubRepoRef(cli.parameters.owner, cli.parameters.repo)
        ).then(project => project.baseDir);
    };

    function sendMessage(text:string, options: {text: string, value: string}[]): Promise<void> {
        const message: SlackMessage = {
            attachments: [
                {text: text,
                 color: "#00a5ff",
                 fallback: "none",
                 mrkdwn_in: ["text"],
                 actions: [
                     menuForCommand(
                         {text: "Add a new target ...",
                         options: options},
                         LibraryImpactChooseTeamLibrary.name,
                         "library")
                 ],
                 }
            ]
        };        
        return cli.context.messageClient.respond(message);
    };

    return goals.withProjectGoals( 
      queryPreferences(cli.context.graphClient),
      cloneRepo,
      sendMessage
    );
}

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

export const LibraryImpactChooseTeamLibrary: CommandHandlerRegistration<ChooseTeamLibraryGoalParameters> = {
    name: "LibraryImpactChooseTeamLibrary",
    description: "set library target using version in current project",
    paramsMaker: ChooseTeamLibraryGoalParameters,
    listener: async cli => chooseTeamLibraryGoal(cli),
};

export const ConfirmUpdate: CommandHandlerRegistration<ConfirmUpdateParameters> = {
    name: "LibraryImpactConfirmUpdate",
    description: "choose to raise a PR on the current project for a library version update",
    paramsMaker: ConfirmUpdateParameters,
    listener: async cli => confirmUpdate(cli),
};

export const ShowGoals: CommandHandlerRegistration<ShowGoalsParameters> = {
    name: "LibraryImpactShowGoals",
    description: "show the current goals for this team",
    intent: "get library targets",
    paramsMaker: ShowGoalsParameters,
    listener: async cli => showGoals(cli),
};
