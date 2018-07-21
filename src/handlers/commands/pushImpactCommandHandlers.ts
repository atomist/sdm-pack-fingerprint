import { Parameters, Parameter, MappedParameter, Value, MappedParameters, Secret } from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";

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

    @Value("name")
    public name: string;

    @Value("version")
    public version: string;
}

@Parameters()
export class ChooseTeamLibraryGoalParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    // TODO this one has name and version in the parameter value
    @Value("library")
    public library: string;

    @Value("version")
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

    @Value("name")
    public name: string;

    @Value("version")
    public version: string;
}

function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return;
}

function setTeamLibraryGoal(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>) {
    return;
}

function confirmUpdate(cli: CommandListenerInvocation<ConfirmUpdateParameters>) {
    return;
}

function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>)

function showGoals(cli: CommandListenerInvocation<ShowGoalsParameters>) {
    cli.context.messageClient.respond("okay, I'll do it");
    // TODO goals-list-message
    // run in a cloned workspace
    // get-goals
    // get current project dependencies (different for differnt file types)
    // turn them into options
    // make an actionable message with a msgid
    //  depends on SetTeamLibraryGoalParameters
    //  update-goals and goals-list-message again

    // goals get-goals update-goals
    return;
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

export const ChooseTeamLibrary: CommandHandlerRegistration<ChooseTeamLibraryGoalParameters> = {
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
