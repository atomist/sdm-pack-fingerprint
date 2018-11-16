import { actionableButton, CommandHandlerRegistration } from "@atomist/sdm";
import { bold, SlackMessage } from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import { footer } from "../../support/util";
import { SetTeamLibrary } from "./setLibraryGoal";

export interface UseLatestParameters {
    name: string;
    version: string;
}

export const UseLatest: CommandHandlerRegistration<UseLatestParameters> = {
    name: "UseLatestLibrary",
    description: "use the latest library",
    intent: "use latest",
    parameters: {
        name: {required: true},
    },
    listener: async cli => {
        const latest: string = await goals.npmLatest(cli.parameters.name);
        const message: SlackMessage = {
            attachments: [
                {
                    text: `Shall we update library \`${cli.parameters.name}\` to ${bold(latest)}?`,
                    fallback: "none",
                    actions: [
                        actionableButton(
                            {
                                text: "Set Target",
                            },
                            SetTeamLibrary,
                            {
                                name: cli.parameters.name,
                                version: latest,
                                fp: "npm-project-deps",
                            },
                        ),
                    ],
                    color: "#ffcc00",
                    footer: footer(),
                    callback_id: "atm-confirm-done",
                },
            ],
        };
        return cli.addressChannels(message);
    },
};
