import { Parameter, Parameters } from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import * as goals from "../../fingerprints/index";
import { queryFingerprintBySha } from "../adhoc/fingerprints";
import { mutatePreference, queryPreferences } from "../adhoc/preferences";

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true })
    public sha: string;

    @Parameter({ required: true })
    public name: string;
}

export const UpdateTargetFingerprint: CommandHandlerRegistration<UpdateTargetFingerprintParameters> =
{
    name: "RegisterTargetFingerprint",
    intent: "set fingerprint goal",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: UpdateTargetFingerprintParameters,
    listener: async cli => {
        cli.context.messageClient.respond(`updating the goal state for all ${cli.parameters.name} fingerprints`);
        return goals.setGoalFingerprint(
            queryPreferences(cli.context.graphClient),
            queryFingerprintBySha(cli.context.graphClient),
            mutatePreference(cli.context.graphClient),
            cli.parameters.name,
            cli.parameters.sha,
        );
    },
};
