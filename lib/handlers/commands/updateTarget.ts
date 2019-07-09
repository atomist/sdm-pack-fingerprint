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
    slackQuestionMessage,
} from "@atomist/sdm";
import { queryFingerprintsByBranchRef } from "../../adhoc/fingerprints";
import {
    deleteFPTarget,
    fromName,
    setFPTarget,
    toName,
} from "../../adhoc/preferences";
import {
    FP,
    Vote,
} from "../../cljEditors.index";
import { Feature } from "../../machine/Feature";
import {
    displayName,
    displayValue,
} from "../../machine/Features";
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
    intent: ["set fingerprint target", "setFingerprintGoal"],
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
        const { type, name } = fromName(cli.parameters.fingerprint);
        const fp: GetFpByBranch.Analysis = query.Repo[0].branches[0].commit.analysis.find(x => x.name === name && x.type === type);
        logger.info(`found sha ${fp.sha}`);
        fp.data = JSON.parse(fp.data);

        if (!!fp.sha) {
            await (setFPTarget(cli.context.graphClient))(fp.type, fp.name, fp);
            return askAboutBroadcast(
                cli,
                {
                    name: fp.name,
                    type: fp.type,
                    data: fp.data,
                    sha: fp.sha,
                },
                cli.parameters.msgId);
        } else {
            return FailurePromise;
        }
    },
};

@Parameters()
export class UpdateTargetFingerprintParameters {

    @Parameter({ required: false, displayable: false })
    public msgId?: string;

    // sha of fingerprint
    @Parameter({ required: true })
    public fpsha: string;

    // name is used to store the fingerprint
    @Parameter({ required: true })
    public fpname: string;

    @Parameter({ required: true })
    public fptype: string;
}

export const UpdateTargetFingerprintName = "RegisterTargetFingerprint";

/**
 * Used by MessageMaker to implement SetNewTarget
 * (knows the name, type, and sha of the potential target fingerprint)
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
                    type: cli.parameters.fptype,
                    name: cli.parameters.fpname,
                    sha: cli.parameters.fpsha,
                },
            },
        );
        const fp: GetFpBySha.SourceFingerprint = query.SourceFingerprint;
        fp.data = JSON.parse(fp.data);
        logger.info(`update target to ${JSON.stringify(fp)}`);
        const fingerprint: FP = {
            name: fp.name,
            type: fp.type,
            data: fp.data,
            sha: fp.sha,
        };

        await (setFPTarget(cli.context.graphClient))(cli.parameters.fptype, cli.parameters.fpname, fingerprint);
        return askAboutBroadcast(cli, fingerprint, cli.parameters.msgId);
    },
};

@Parameters()
export class SetTargetFingerprintParameters {

    // fp is the JSONified version of the entire Fingerprint
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
        await (setFPTarget(cli.context.graphClient))(fp.type, fp.name, fp);

        return askAboutBroadcast(cli, fp, cli.parameters.msgId);
    },
};

@Parameters()
export class DeleteTargetFingerprintParameters {
    @Parameter({ required: true })
    public type: string;
    @Parameter({ required: true })
    public name: string;
    @Parameter({ required: false, displayable: false })
    public msgId: string;
}

export const DeleteTargetFingerprint: CommandHandlerRegistration<DeleteTargetFingerprintParameters> = {
    name: "DeleteTargetFingerprint",
    intent: ["delete fingerprint target", "deleteFingerprintTarget"],
    description: "remove the team target for a particular fingerprint",
    paramsMaker: DeleteTargetFingerprintParameters,
    listener: async cli => {
        return (deleteFPTarget(cli.context.graphClient))(cli.parameters.type, cli.parameters.name)
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
export async function setNewTargetFingerprint(
    ctx: HandlerContext,
    feature: Feature,
    fp: FP,
    channel: string): Promise<Vote> {

    // TODO this FP doesn't necessarily hold an FP with a version
    const message = slackQuestionMessage(
        "Fingerprint Target",
        `Shall we update the target of ${displayName(feature, fp)} to \`${displayValue(feature, fp)}\` for all projects?`,
        {
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
            callback_id: "atm-confirm-done",
        },
    );

    await ctx.messageClient.addressChannels(message, channel);

    // I don't want to vote on whether there was a compliance issue here
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
    intent: ["set fingerprint target", "setFingerprintTarget", "setTargetFingerprint"],
    description: "select a fingerprint in this project to become a target fingerprint",
    paramsMaker: SelectTargetFingerprintFromCurrentProjectParameters,
    listener: async cli => {

        // this has got to be wrong.  ugh
        const branch: string = cli.parameters.branch || "master";

        const fps: GetAllFpsOnSha.Analysis[] = await queryFingerprintsByBranchRef(cli.context.graphClient)(
            cli.parameters.repo,
            cli.parameters.owner,
            branch);

        const message = slackQuestionMessage(
            "Fingerprint Target",
            "Choose one of the current fingerprints:",
            {
                actions: [
                    menuForCommand(
                        {
                            text: "select fingerprint",
                            options: [
                                ...fps.map(x => {
                                    return {
                                        value: toName(x.type, x.name),
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
            });

        return cli.addressChannels(message);
    },
};
