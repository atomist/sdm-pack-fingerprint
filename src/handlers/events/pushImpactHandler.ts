import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";

import { Maker } from "@atomist/automation-client/util/constructionUtils";
import * as impact from "@atomist/clj-editors";
import * as graphql from "../../typings/types";
import { SlackMessage } from "@atomist/slack-messages";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";

@EventHandler("register push impact handling functions", subscription("push-impact"))
export class PushImpactHandler implements HandleEvent<graphql.PushImpactEvent.Subscription> {

    public handle(
        event: EventFired<graphql.PushImpactEvent.Subscription>,
        ctx: HandlerContext,
    ): Promise<HandlerResult> {
        logger.info("handler PushImpactEvent subscription");
        impact.processPushImpact(
            event,
            [{
                selector: (fp: impact.FP) => {
                    logger.info(`check fp ${fp.name}`);
                    return (fp.name === "fingerprint1");
                },
                action: (diff: impact.Diff) => {
                    logger.info(`check diff from ${diff.from.sha} to ${diff.to.sha}`);
                    let message:SlackMessage = {
                        "text": "improved presentation",
                        "attachments": [
                        {
                            "text": "do you want to say hello to qcon?",
                            "fallback": "fallback message",
                            "mrkdwn_in": [
                                "text"
                            ],
                            "callback_id": "cllbck1",
                            "actions": [
                                buttonForCommand({text: "yes" }, "helloQcon", { sha: diff.to.sha })
                            ]
                        }
                    ]}
                    ctx.messageClient.addressChannels(message,["clj1"]);
                    return;
                },
            }]);
        return SuccessPromise;
    }
}

export const createPushImpactHandler: Maker<PushImpactHandler> = () => new PushImpactHandler();
