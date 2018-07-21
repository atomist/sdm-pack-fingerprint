import {
    EventFired,
    HandlerContext,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";
import { OnEvent } from "@atomist/automation-client/onEvent";
import { buttonForCommand, SlackFileMessage } from "@atomist/automation-client/spi/message/MessageClient";
import * as impact from "@atomist/clj-editors";
import { SlackMessage } from "@atomist/slack-messages";
import { PushImpactEvent, GetFingerprintData } from "../../typings/types";
import { EventHandlerRegistration } from "@atomist/sdm";
import { NoParameters } from "@atomist/automation-client/SmartParameters";
import { QueryOptions } from "@atomist/automation-client/internal/graph/graphQL";
import { QueryNoCacheOptions } from "@atomist/automation-client/spi/graph/GraphClient";
import _ = require("lodash");
import * as clj from "@atomist/clj-editors";

function qcon(ctx:HandlerContext, diff: impact.Diff): void {
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
    ctx.messageClient.addressChannels(message, [ "clj1" ]);
    return;
}

function forFingerprint(s:string): (fp: impact.FP) => boolean {
   return (fp: impact.FP) => {
       logger.info(`check fp ${fp.name}`);
       return (fp.name === s);
   }
}

function getFingerprintDataCallback(ctx: HandlerContext): (sha:string, name:string) => Promise<string> {
    return (sha:string, name:string):Promise<string> => {
        return ctx.graphClient.query<GetFingerprintData.Query, GetFingerprintData.Variables>({
            name: "get-fingerprint",
            variables: {
                sha: sha,
                name: name
            },
            options: QueryNoCacheOptions,
        })
        .then(result => {
            logger.info(`getFingerprintData:  got successful result ${result}`);
            const fingerprints =
                _.get(result, "Commit[0].fingerprints") as GetFingerprintData.Fingerprints[];
            if (fingerprints) {
                return fingerprints[0].data as string; 
            }
            return "{}";
        })
        .catch( (reason) => {
            logger.info(`error getting fingerprint data ${reason}`);
            return "{}"
        });
    }
}

function renderDiffSnippet(ctx: HandlerContext, diff: impact.Diff): void {
    // TODO SlackFileMessages seem to not be sendable currently
    ctx.messageClient.addressChannels( clj.renderDiff(diff), diff.channel);
}

function checkLibraryGoals(ctx: HandlerContext, diff: impact.Diff): void {
    
}

const PushImpactHandle: OnEvent<PushImpactEvent.Subscription> =
    (event: EventFired<PushImpactEvent.Subscription>, ctx: HandlerContext) => {
        logger.info("handler PushImpactEvent subscription");
        impact.processPushImpact(
            event,
            getFingerprintDataCallback(ctx),
            [ 
                {
                    selector: forFingerprint("npm-project-deps"),
                    action: (diff: impact.Diff) => {
                        logger.info(`check for goal diffs here`);
                        checkLibraryGoals(ctx,diff);
                    },
                    diffAction: (diff: impact.Diff) => {
                        renderDiffSnippet(ctx,diff);
                    },
                }
            ]
        );
        return SuccessPromise;
    };

export const PushImpactHandler: EventHandlerRegistration<PushImpactEvent.Subscription, NoParameters> = {
    name: "PushImpactHandler",
    description: "Register push impact handling functions",
    subscription: subscription("push-impact"),
    listener: PushImpactHandle,
};
