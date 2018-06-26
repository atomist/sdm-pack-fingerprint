import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    SuccessPromise,
    logger,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";
import {
    addressSlackUsers,
    buttonForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {
    Attachment,
    codeLine,
    SlackMessage,
} from "@atomist/slack-messages/SlackMessages";

import * as graphql from "../../typings/types";
import * as impact from "@atomist/clj-editors";
import { Maker } from "@atomist/automation-client/util/constructionUtils";

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
                    return;
                }
            }]);
        return SuccessPromise;
    }
}

export const createPushImpactHandler: Maker<PushImpactHandler> = () => {return new PushImpactHandler();};