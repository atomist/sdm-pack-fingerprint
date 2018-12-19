/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GitProject,
    logger,
    MappedParameter,
    MappedParameters,
    menuForCommand,
    NoParameters,
    Parameter,
    Parameters,
    Secret,
    SlackFileMessage,
} from "@atomist/automation-client";
import {
    CodeInspection,
    CodeInspectionRegistration,
    CommandHandlerRegistration,
    CommandListenerInvocation,
} from "@atomist/sdm";

import { SlackMessage } from "@atomist/slack-messages";
import * as goals from "../../../fingerprints/index";
import {
    FP,
    fpPreference,
    fpPreferences,
    renderData,
} from "../../../fingerprints/index";
import { queryChatTeamById } from "../../adhoc/fingerprints";
import {
    mutatePreference,
    queryPreferences,
} from "../../adhoc/preferences";
import { footer } from "../../support/util";
import { ChatTeamPreferences } from "../../typings/types";
import { ChooseTeamLibrary } from "./setLibraryGoal";

// ------------------------------
// show targets
// ------------------------------

const showTargets = async (cli: CommandListenerInvocation<NoParameters>) => {

    const sendMessage = (options: Array<{ text: string, value: string }>): Promise<void> => {
        const c: string = goals.renderOptions(options);
        logger.info(`content ${c}`);
        const message: SlackFileMessage = {
            content: c,
            fileType: "text",
            title: `Library Targets`,
        };
        return cli.addressChannels(message as SlackMessage);
    };

    return goals.withPreferences(
        queryPreferences(cli.context.graphClient),
        sendMessage,
    );
};

export const ShowTargets: CommandHandlerRegistration<NoParameters> = {
    name: "ShowTargets",
    description: "show the current targets",
    intent: "show targets",
    listener: showTargets,
};

// ------------------------------
// show goals
// ------------------------------

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

const showGoals: CodeInspection<boolean, ShowGoalsParameters> = async (p, cli) => {

    const sendMessage = (text: string, options: Array<{ text: string, value: string }>): Promise<void> => {
        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Library Targets",
                    text,
                    color: "#00a5ff",
                    fallback: "Library Targets",
                    mrkdwn_in: ["text"],
                    actions: [
                        menuForCommand(
                            {
                                text: "Add a new target ...",
                                options,
                            },
                            ChooseTeamLibrary.name,
                            "library",
                            ),
                    ],
                    footer: footer(),
                },
            ],
        };
        return cli.addressChannels(message);
    };

    return goals.withProjectGoals(
        queryPreferences(cli.context.graphClient),
        (p as GitProject).baseDir,
        sendMessage,
    );
};

export const ShowGoals: CodeInspectionRegistration<boolean, ShowGoalsParameters> = {
    name: "LibraryImpactShowGoals",
    description: "show the current goals for this team",
    intent: "get library targets",
    paramsMaker: ShowGoalsParameters,
    inspection: showGoals,
};

// ------------------------------
// clear library targets
// ------------------------------

export const ClearLibraryTargets: CommandHandlerRegistration = {
    name: "ClearLibraryTargets",
    description: "reset all library targets for this team",
    intent: "clear library targets",
    listener: async cli => {
        const mutatePreferenceUpdate = mutatePreference(cli.context.graphClient);
        return queryChatTeamById(cli.context.graphClient, cli.context.workspaceId).then(
            chatTeamId => {
                return mutatePreferenceUpdate("atomist:fingerprints:clojure:project-deps", chatTeamId, "{}");
            },
        ).then(
            result => {
                return cli.addressChannels("successfully cleaned preferences");
            },
        ).catch(
            error => {
                return cli.addressChannels(`unable to clear library targets  ${error}`);
            },
        );
    },
};

export const DumpLibraryPreferences: CommandHandlerRegistration = {
    name: "DumpLibraryPreferences",
    description: "dump current prefs into a JSON file",
    intent: "dump preferences",
    listener: async cli => {
        const query = queryPreferences(cli.context.graphClient);
        return query()
        .then(
            result => {
                const message: SlackFileMessage = {
                    title: "library prefs",
                    content: goals.renderData(result),
                    fileType: "text",
                };
                return cli.addressChannels(message);
            },
        ).catch(
            error => {
                return cli.addressChannels(`unable to fetch preferences ${error}`);
            },
        );
    },
};

@Parameters()
export class ListOneFingerprintTargetParameters {
    @Parameter({required: true, description: "fingerprint to display"})
    public fingerprint: string;
}

export const ListOneFingerprintTarget: CommandHandlerRegistration<ListOneFingerprintTargetParameters> = {
    name: "ListOneFingerprintTarget",
    description: "list a single fingerprint target",
    paramsMaker: ListOneFingerprintTargetParameters,
    intent: "listOneFingerprintTarget",
    listener: async cli => {
        const query: ChatTeamPreferences.Query = await (queryPreferences(cli.context.graphClient))();

        const fp: FP = fpPreference(query, cli.parameters.fingerprint);
        logger.info(`fps ${goals.renderData(fp)}`);

        const message: SlackFileMessage = {
            title: `current target for ${cli.parameters.fingerprint}`,
            content: renderData(fp),
            fileType: "text",
        };

        return cli.addressChannels(message);
    },
};

export const ListFingerprintTargets: CommandHandlerRegistration = {
    name: "ListFingerprintTargets",
    description: "list all current fingerprint targets",
    intent: "listFingerprintTargets",
    listener: async cli => {

        const query: ChatTeamPreferences.Query = await (queryPreferences(cli.context.graphClient))();

        const fps: FP[] = fpPreferences(query);
        logger.info(`fps ${goals.renderData(fps)}`);

        const message: SlackMessage = {
            attachments: [
                {
                    text: "Choose one of the current fingerprints",
                    fallback: "select fingerprint",
                    actions: [
                        menuForCommand(
                            {
                                text: "select fingerprint",
                                options: [
                                    ...fps.map(x => {
                                        return {
                                            value: x.name,
                                            text: x.name,
                                        };
                                    }),
                                ],
                            },
                            ListOneFingerprintTarget,
                            "fingerprint",
                            {},
                        ),
                    ],
                },
            ],
        };

        return cli.addressChannels(message);
    },
};
