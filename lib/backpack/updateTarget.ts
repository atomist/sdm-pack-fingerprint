import { GraphClient, Parameter, Parameters } from "@atomist/automation-client";
import { CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";
import * as goals from "../../fingerprints/index";
import { queryFingerprintBySha } from "../adhoc/fingerprints";
import { mutatePreference, queryPreferences } from "../adhoc/preferences";

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true})
    public sha: string;

    @Parameter({ required: true })
    public name: string;
}

async function setTeamTargetFingerprint(client: GraphClient, cli: CommandListenerInvocation<UpdateTargetFingerprintParameters>) {
    return goals.setGoalFingerprint(
        queryPreferences(cli.context.graphClient),
        queryFingerprintBySha(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.name,
        cli.parameters.sha,
    );
}

export function updateTargetFingerprint(client: GraphClient): CommandHandlerRegistration<UpdateTargetFingerprintParameters> {
    return {
        name: "UpdateTargetFingerprint",
        intent: "set library target",
        description: "set a new target for a team to consume a particular version",
        paramsMaker: UpdateTargetFingerprintParameters,
        listener: async cli => setTeamTargetFingerprint(client, cli),
    };
}
