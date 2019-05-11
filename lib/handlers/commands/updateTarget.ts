/*
 * Copyright © 2019 Atomist, Inc.
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
    FailurePromise,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    menuForCommand,
    Parameter,
    Parameters,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import {
    actionableButton,
    CommandHandlerRegistration,
    slackFooter,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import _ = require("lodash");
import {
    FP,
    Vote,
} from "../../../fingerprints/index";
import {
    queryFingerprintsByBranchRef,
} from "../../adhoc/fingerprints";
import {
    deleteFPTarget,
    setFPTarget,
} from "../../adhoc/preferences";
import {
    GetAllFpsOnSha,
    GetFpByBranch,
    GetFpBySha,
} from "../../typings/types";
import { askAboutBroadcast } from "./broadcast";

@Parameters()
export class SetTargetFingerprintFromLatestMasterParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: true })
    public fingerprint: string;

    @Parameter({ required: false })
    public branch: string;

    @Parameter({ required: false, displayable: false })
    public msgId?: string;
}

/**
 * bootstraps a Fingerprint from a project
 * looks up the fingerprint before setting it but name of fingerprint is in the parameter list
 */
export const SetTargetFingerprintFromLatestMaster: CommandHandlerRegistration<SetTargetFingerprintFromLatestMasterParameters> = {
    name: "SetTargetFingerprintFromLatestMaster",
    intent: "setFingerprintGoal",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: SetTargetFingerprintFromLatestMasterParameters,
    listener: async cli => {

        const branch = cli.parameters.branch || "master";

        const query: GetFpByBranch.Query = await cli.context.graphClient.query<GetFpByBranch.Query, GetFpByBranch.Variables>({
            name: "GetFpByBranch",
            options: QueryNoCacheOptions,
            variables: {
                owner: cli.parameters.owner,
                repo: cli.parameters.repo,
                branch,
            },
        });
        const fp: GetFpByBranch.Analysis = query.Repo[0].branches[0].commit.analysis.find(x => x.name === cli.parameters.fingerprint);
        logger.info(`found sha ${fp.sha}`);
        fp.data = JSON.parse(fp.data);

        if (!!fp.sha) {
            await (setFPTarget(cli.context.graphClient))(fp.name, fp);
            return askAboutBroadcast(cli, cli.parameters.fingerprint, "version", fp.sha, cli.parameters.msgId);
        } else {
            return FailurePromise;
        }
    },
};

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    @Parameter({ required: true })
    public sha: string;

    @Parameter({ required: true })
    public name: string;
}

export const UpdateTargetFingerprintName = "RegisterTargetFingerprint";

/**
 * Used by MessageMaker to implement SetNewTarget
 * (knows the name and sha of the target fingerprint)
 */
export const UpdateTargetFingerprint: CommandHandlerRegistration<UpdateTargetFingerprintParameters> = {
    name: UpdateTargetFingerprintName,
    description: "set a new target for a team to consume a particular version",
    paramsMaker: UpdateTargetFingerprintParameters,
    listener: async cli => {

        const query: GetFpBySha.Query = await cli.context.graphClient.query<GetFpBySha.Query, GetFpBySha.Variables>(
            {
                options: QueryNoCacheOptions,
                name: "GetFpBySha",
                variables: {
                    sha: cli.parameters.sha,
                },
            },
        );
        const fp: GetFpBySha.AtomistFingerprint = query.AtomistFingerprint[0];
        fp.data = JSON.parse(fp.data);
        logger.info(`update target to ${JSON.stringify(fp)}`);
        const fingerprint: FP = {
            name: fp.name,
            data: fp.data,
            sha: fp.sha,
            version: "1.0",
            abbreviation: "abbreviation",
        };

        await (setFPTarget(cli.context.graphClient))(cli.parameters.name, fingerprint);
        return askAboutBroadcast(cli, cli.parameters.name, "version", cli.parameters.sha, cli.parameters.msgId);
    },
};

@Parameters()
export class SetTargetFingerprintParameters {

    @Parameter({ required: true, displayable: false, control: "textarea", pattern: /.*/ })
    public fp: string;

    @Parameter({ required: false, displayable: false })
    public msgId?: string;
}

/**
 * Used by other diff handlers to change or bootstrap a target because coordinates have changed
 * (knows the whole json structure of the fingerprint)
 */
export const SetTargetFingerprint: CommandHandlerRegistration<SetTargetFingerprintParameters> = {
    name: "SetTargetFingerprint",
    description: "set a target fingerprint",
    paramsMaker: SetTargetFingerprintParameters,
    listener: async cli => {
        logger.info(`set target fingerprint for ${cli.parameters.fp}`);
        const fp = {
            user: { id: cli.context.source.slack.user.id },
            ...JSON.parse(cli.parameters.fp),
        };
        await (setFPTarget(cli.context.graphClient))(fp.name, fp);

        return askAboutBroadcast(cli, fp.name, fp.data[1], fp.sha, cli.parameters.msgId);
    },
};

@Parameters()
export class DeleteTargetFingerprintParameters {
    @Parameter({ required: true })
    public name: string;
    @Parameter({ required: false, displayable: false })
    public msgId: string;
}

export const DeleteTargetFingerprint: CommandHandlerRegistration<DeleteTargetFingerprintParameters> = {
    name: "DeleteTargetFingerprint",
    intent: "deleteFingerprintTarget",
    description: "remove the team target for a particular fingerprint",
    paramsMaker: DeleteTargetFingerprintParameters,
    listener: async cli => {
        return (deleteFPTarget(cli.context.graphClient))(cli.parameters.name)
            .then(result => {
                return {
                    code: 0,
                    message: `successfully deleted ${cli.parameters.name}`,
                };
            })
            .catch(error => {
                logger.error(error);
                return {
                    code: 1,
                    message: `failed to delete target`,
                };
            });
    },
};

/**
 * Used in other diff handlers to maybe choose to set a new target because one of them has changed
 * (assumed to be a new message - not updating anything)
 *
 * @param ctx
 * @param fp
 * @param channel
 */
export async function setNewTargetFingerprint(ctx: HandlerContext,
                                              fp: FP,
                                              channel: string): Promise<Vote> {
    const message: SlackMessage = {
        attachments: [
            {
                text: `Shall we update the target version of \`${fp.name}\` to \`${_.get(fp.data, "[1]")}\` for all projects?`,
                fallback: "none",
                actions: [
                    actionableButton<any>(
                        {
                            text: "Set Target",
                        },
                        SetTargetFingerprint,
                        {
                            fp: JSON.stringify(fp),
                        },
                    ),
                ],
                color: "#ffcc00",
                footer: slackFooter(),
                callback_id: "atm-confirm-done",
            },
        ],
    };
    await ctx.messageClient.addressChannels(message, channel);

    return { abstain: true };
}

@Parameters()
export class SelectTargetFingerprintFromCurrentProjectParameters {
    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public providerId: string;

    @Parameter({ required: false, description: "pull fingerprints from a branch ref" })
    public branch: string;

    @Parameter({ required: false, displayable: false })
    public msgId: string;
}

function shortenName(s: string): string {
    if (s.length >= 30) {
        return "..." + s.substring(s.length - 27);
    } else {
        return s;
    }
}

/**
 * Bootstrap a fingerprint target by selecting one out of the current set
 */
export const SelectTargetFingerprintFromCurrentProject: CommandHandlerRegistration<SelectTargetFingerprintFromCurrentProjectParameters> = {
    name: "SelectTargetFingerprintFromCurrentProject",
    intent: ["setFingerprintTarget", "setTargetFingerprint"],
    description: "select a fingerprint in this project to become a target fingerprint",
    paramsMaker: SelectTargetFingerprintFromCurrentProjectParameters,
    listener: async cli => {

        // this has got to be wrong.  ugh
        const branch: string = cli.parameters.branch || "master";

        const fps: GetAllFpsOnSha.Analysis[] = await queryFingerprintsByBranchRef(cli.context.graphClient)(
            cli.parameters.repo,
            cli.parameters.owner,
            branch);

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
                                            text: shortenName(x.name),
                                        };
                                    }),
                                ],
                            },
                            SetTargetFingerprintFromLatestMaster.name,
                            "fingerprint",
                            {
                                owner: cli.parameters.owner,
                                repo: cli.parameters.repo,
                                branch,
                                providerId: cli.parameters.providerId,
                            },
                        ),
                    ],
                },
            ],
        };

        return cli.addressChannels(message);
    },
};
