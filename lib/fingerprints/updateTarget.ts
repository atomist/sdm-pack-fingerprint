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
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    FailurePromise,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import * as goals from "../../fingerprints/index";
import { queryFingerprintBySha, queryFingerprintOnShaByName } from "../adhoc/fingerprints";
import {
    mutatePreference,
    queryPreferences,
} from "../adhoc/preferences";
import { GetFingerprintOnShaByName } from "../typings/types";
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
}

export const SetTargetFingerprintFromLatestMaster: CommandHandlerRegistration<SetTargetFingerprintFromLatestMasterParameters> = {
    name: "SetTargetFingerprintFromLatestMaster",
    intent: "setFingerprintGoal",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: SetTargetFingerprintFromLatestMasterParameters,
    listener: async cli => {

        const query: GetFingerprintOnShaByName.Query =
            await (queryFingerprintOnShaByName(cli.context.graphClient))(
                cli.parameters.repo,
                cli.parameters.owner,
                "master",
                cli.parameters.fingerprint,
            );
        const sha: string = query.Repo[0].branches[0].commit.fingerprints[0].sha;
        logger.info(`found sha ${sha}`);
        if (sha) {
            await goals.setGoalFingerprint(
                queryPreferences(cli.context.graphClient),
                queryFingerprintBySha(cli.context.graphClient),
                mutatePreference(cli.context.graphClient),
                cli.parameters.fingerprint,
                sha,
            );
            return askAboutBroadcast(cli, cli.parameters.fingerprint, "version", sha);
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

export const UpdateTargetFingerprint: CommandHandlerRegistration<UpdateTargetFingerprintParameters> = {
    name: "RegisterTargetFingerprint",
    description: "set a new target for a team to consume a particular version",
    paramsMaker: UpdateTargetFingerprintParameters,
    listener: async cli => {
        await cli.context.messageClient.respond(`updating the goal state for all ${cli.parameters.name} fingerprints`);
        await goals.setGoalFingerprint(
            queryPreferences(cli.context.graphClient),
            queryFingerprintBySha(cli.context.graphClient),
            mutatePreference(cli.context.graphClient),
            cli.parameters.name,
            cli.parameters.sha,
        );
        return askAboutBroadcast(cli, cli.parameters.name, "version", cli.parameters.sha);
    },
};

@Parameters()
export class DeleteTargetFingerprintParameters {
    @Parameter({ required: true })
    public name: string;
}

export const DeleteTargetFingerprint: CommandHandlerRegistration<DeleteTargetFingerprintParameters> = {
    name: "DeleteTargetFingerprint",
    intent: "deleteFingerprintGoal",
    description: "remove the team target for a particular fingerprint",
    paramsMaker: DeleteTargetFingerprintParameters,
    listener: async cli => {
        await cli.context.messageClient.respond(`updating the goal state for all ${cli.parameters.name} fingerprints`);
        await goals.deleteGoalFingerprint(
            queryPreferences(cli.context.graphClient),
            mutatePreference(cli.context.graphClient),
            cli.parameters.name,
        );
    },
};
