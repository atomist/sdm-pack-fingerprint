import { HandlerContext, Parameter, Parameters } from "@atomist/automation-client";
import { actionableButton, CommandHandlerRegistration, CommandListenerInvocation } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import { mutatePreference, queryPreferences } from "../../adhoc/preferences";
import { footer } from "../../support/util";
import { askAboutBroadcast } from "./broadcast";

@Parameters()
export class SetTeamLibraryGoalParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true })
    public name: string;

    @Parameter({ required: true })
    public version: string;

    @Parameter({ required: true })
    public fp: string;
}

async function setTeamLibraryGoal(cli: CommandListenerInvocation<SetTeamLibraryGoalParameters>) {
    await goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.fp,
        {
            name: cli.parameters.name,
            version: cli.parameters.version,
        },
    );
    return askAboutBroadcast(cli, cli.parameters.name, cli.parameters.version, cli.parameters.fp);
}

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
    fp: string;
}

async function chooseTeamLibraryGoal(cli: CommandListenerInvocation<ChooseTeamLibraryGoalParameters>) {
    await goals.withNewGoal(
        queryPreferences(cli.context.graphClient),
        mutatePreference(cli.context.graphClient),
        cli.parameters.fp,
        cli.parameters.library,
    );
    const args: string[] = cli.parameters.library.split(":");
    return askAboutBroadcast(cli, args[0], args[1], args[2]);
}

export const ChooseTeamLibrary: CommandHandlerRegistration<ChooseTeamLibraryGoalParameters> = {
    name: "LibraryImpactChooseTeamLibrary",
    description: "set library target using version in current project",
    parameters: {
        msgId: { required: false, displayable: false },
        library: {},
        fp: { required: true, displayable: false},
    },
    listener: chooseTeamLibraryGoal,
};

export function setNewTarget(ctx: HandlerContext, fp: string, name: string, version: string, channel: string) {
    const coordToDeps = new Map<string, string>();
    coordToDeps.set("npm-project-coordinates", "npm-project-deps");
    coordToDeps.set("clojure-project-coordinates", "clojure-project-deps");
    const libTargetNs: string = coordToDeps.get(fp);
    const message: SlackMessage = {
        attachments: [
            {
                text: `Shall we update library target of \`${name}\` to ${version}?`,
                fallback: "none",
                actions: [
                    actionableButton(
                        {
                            text: "Set Target",
                        },
                        SetTeamLibrary,
                        {
                            name,
                            version,
                            fp: libTargetNs,
                        },
                    ),
                ],
                color: "#ffcc00",
                footer: footer(),
                callback_id: "atm-confirm-done",
            },
        ],
    };
    return ctx.messageClient.addressChannels(message, channel);
}
