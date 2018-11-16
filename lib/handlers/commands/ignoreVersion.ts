import { MappedParameter, MappedParameters, Parameter, Parameters } from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";
import * as goals from "../../../fingerprints/index";
import { mutateIgnores, queryPreferences } from "../../adhoc/preferences";

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

    @Parameter({ required: true })
    public name: string;

    @Parameter({ required: true })
    public version: string;
}

async function ignoreVersion(cli: CommandListenerInvocation<IgnoreVersionParameters>) {
    return goals.withNewIgnore(
        queryPreferences(cli.context.graphClient),
        mutateIgnores(cli.context.graphClient),
        {
            owner: cli.parameters.owner,
            repo: cli.parameters.repo,
            name: cli.parameters.name,
            version: cli.parameters.version,
        },
    ).then(v => {
        if (v) {
            return cli.addressChannels(`now ignoring ${cli.parameters.name}/${cli.parameters.version}`);
        } else {
            return cli.addressChannels("failed to update ignore");
        }
    });
}

export const IgnoreVersion: CommandHandlerRegistration<IgnoreVersionParameters> = {
    name: "LibraryImpactIgnoreVersion",
    description: "Allow a Project to skip one version of library goal",
    paramsMaker: IgnoreVersionParameters,
    listener: async cli => ignoreVersion(cli),
};
