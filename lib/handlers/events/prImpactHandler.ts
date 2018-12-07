import { logger, NoParameters, SuccessPromise } from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import { EventHandlerRegistration } from "@atomist/sdm";
import { renderData } from "../../..";
import { PullRequestImpactEvent } from "../../typings/types";

export const PullRequestImpactHandlerRegistration: EventHandlerRegistration<PullRequestImpactEvent.Subscription, NoParameters> = {
    name: "PullReqestImpactHandler",
    description: "register pull request impact handling events",
    subscription: subscription("PullRequestImpactEvent"),
    listener: async (event, ctx) => {
        logger.info("PullRequestImpactHandler");
        logger.info(renderData(event));
        return SuccessPromise;
    },
};
