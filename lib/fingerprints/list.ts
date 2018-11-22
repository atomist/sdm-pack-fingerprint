import { MappedParameter, MappedParameters, Parameter, Parameters, SlackFileMessage, logger } from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import * as fingerprints from "../../fingerprints";
import { queryFingerprintsByBranchRef } from "../adhoc/fingerprints";

@Parameters()
export class ListFingerprintParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: false , description: "pull fingerprints from a branch ref"})
    public branch: string;
}

export const ListFingerprints: CommandHandlerRegistration<ListFingerprintParameters> = {
    name: "ListFingerprints",
    intent: "listFingerprints",
    description: "list the fingerprints on a particular ref",
    paramsMaker: ListFingerprintParameters,
    listener: async cli => {
        
        // this has got to be wrong.  ugh
        const branch: string = cli.parameters.branch || "master";
        logger.info(`use branch ${branch}`);

        const fps = fingerprints.list(
            await queryFingerprintsByBranchRef(cli.context.graphClient)(
                cli.parameters.repo,
                cli.parameters.owner,
                branch,
            ));
        const message: SlackFileMessage = {
            title: `fingerprints currently on ${cli.parameters.owner}/${cli.parameters.repo}`,
            content: fingerprints.renderData(fps),
            fileType: "text",
        };
        return cli.addressChannels(message);
    },
};
