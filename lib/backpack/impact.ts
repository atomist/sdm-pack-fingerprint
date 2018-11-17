import { HandlerContext } from "@atomist/automation-client";
import { actionableButton } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as fingerprints from "../../fingerprints/index";
import { queryPreferences } from "../adhoc/preferences";
import { footer } from "../support/util";
import { ApplyTargetFingerprint } from "./applyFingerprint";
import { UpdateTargetFingerprint } from "./updateTarget";

// when we discover a backpack dependency that is not the target state
// then we ask the user whether they want to update to the new target version
// or maybe they want this backpack version to become the new target version
function callback(ctx: HandlerContext, diff: fingerprints.Diff):
    (s: string, fingerprint: fingerprints.FP) => Promise<any> {
    return async (text, fingerprint) => {
        const msgId = fingerprints.consistentHash([fingerprint.sha, diff.channel, diff.owner, diff.repo]);
        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "Backpack Target",
                    text,
                    color: "#45B254",
                    fallback: "Backpack Target",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            { text: "Accept" },
                            ApplyTargetFingerprint,
                            {
                                msgId,
                                owner: diff.owner,
                                repo: diff.repo,
                                fingerprint: fingerprint.name,
                            }),
                        actionableButton(
                            { text: "Set as Target" },
                            UpdateTargetFingerprint,
                            {
                                msgId,
                                name: fingerprint.name,
                                sha: fingerprint.sha,
                            },
                        ),
                    ],
                    footer: footer(),
                },
            ],
        };
        return ctx.messageClient.addressChannels(message, diff.channel, {id: msgId});
    };
}

export async function checkBackpackTargets(ctx: HandlerContext, diff: fingerprints.Diff): Promise<any> {
    return fingerprints.checkFingerprintGoals(
        queryPreferences(ctx.graphClient),
        callback(ctx, diff),
        diff,
    );
}
