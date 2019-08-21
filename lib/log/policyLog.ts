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
    addressEvent,
    HandlerContext,
} from "@atomist/automation-client";

export interface PolicyLog {
    type: string;
    name: string;

    manage?: ManagePolicyLog;
    apply?: ApplyPolicyLog;
    manage?: ManagePolicyLog
    apply?: ApplyPolicyLog

    ts?: number;
}

export interface ManagePolicyLog {
    action: ManagePolicyAction;
    reason: string;
    author: string;
    targetSha?: string;
    targetValue?: string;
}

export enum ManagePolicyAction {
    Set = "set",
    Unset = "unset",
}

export interface ApplyPolicyLog {
    _name: string;
    _owner: string;
    _provider: string;

    _sha: string;
    _prId: string;

    state: ApplyPolicyState;

    branch: string;
    targetSha: string;

    message?: string;
}

export enum ApplyPolicyState {
    Success = "success",
    Failure = "failure",
}

export async function sendPolicyLog(log: PolicyLog, ctx: HandlerContext): Promise<void> {
    await ctx.messageClient.send(
        {
            ...log,
            ts: Date.now(),
        },
        addressEvent("PolicyLog"));
}
