import {
    EventFired,
    HandlerContext,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";
import { OnEvent } from "@atomist/automation-client/onEvent";
import { NoParameters } from "@atomist/automation-client/SmartParameters";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import * as impact from "@atomist/clj-editors";
import { EventHandlerRegistration } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import { PushImpactEvent } from "../../typings/types";

const PushImpactHandle: OnEvent<PushImpactEvent.Subscription> =
    (event: EventFired<PushImpactEvent.Subscription>, ctx: HandlerContext) => {

        logger.info("handler PushImpactEvent subscription");
        impact.processPushImpact(
            event,
            [ {
                selector: (fp: impact.FP) => {
                    logger.info(`check fp ${fp.name}`);
                    return (fp.name === "fingerprint1");
                },
                action: (diff: impact.Diff) => {
                    logger.info(`check diff from ${diff.from.sha} to ${diff.to.sha}`);
                    const message: SlackMessage = {
                        text: "improved presentation",
                        attachments: [
                            {
                                text: "do you want to say hello to qcon?",
                                fallback: "fallback message",
                                mrkdwn_in: [
                                    "text",
                                ],
                                callback_id: "cllbck1",
                                actions: [
                                    buttonForCommand({ text: "yes" }, "helloQcon", { sha: diff.to.sha }),
                                ],
                            },
                        ],
                    };
                    return ctx.messageClient.addressChannels(message, [ "clj1" ]);
                },
            } ]);
        return SuccessPromise;
    };

export const PushImpactHandler: EventHandlerRegistration<PushImpactEvent.Subscription, NoParameters> = {
    name: "PushImpactHandler",
    description: "Register push impact handling functions",
    subscription: subscription("push-impact"),
    listener: PushImpactHandle,
};
