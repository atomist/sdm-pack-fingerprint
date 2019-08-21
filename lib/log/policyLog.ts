import {
    addressEvent,
    HandlerContext,
} from "@atomist/automation-client";

export interface PolicyLog {
    type: string;
    name: string;

    manage?: ManagePolicyLog
    apply?: ApplyPolicyLog
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

    state: ApplyPolicyState

    branch: string;
    targetSha: string;

    message?: string;
}

export enum ApplyPolicyState {
    Success = "success",
    Failure = "failure",
}

export async function sendPolicyLog(log: PolicyLog, ctx: HandlerContext): Promise<void> {
    await ctx.messageClient.send(log, addressEvent("PolicyLog"));
}
