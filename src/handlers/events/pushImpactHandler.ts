import {
    EventFired,
    HandlerContext,
    logger,
    SuccessPromise,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";
import { OnEvent } from "@atomist/automation-client/onEvent";
import { buttonForCommand, SlackFileMessage, Destination, SlackDestination, menuForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import * as impact from "@atomist/clj-editors";
import { SlackMessage, channel } from "@atomist/slack-messages";
import { PushImpactEvent, GetFingerprintData } from "../../typings/types";
import { EventHandlerRegistration } from "@atomist/sdm";
import { NoParameters } from "@atomist/automation-client/SmartParameters";
import { QueryOptions, query } from "@atomist/automation-client/internal/graph/graphQL";
import { QueryNoCacheOptions } from "@atomist/automation-client/spi/graph/GraphClient";
import _ = require("lodash");
import * as clj from "@atomist/clj-editors";
import { queryPreferences, ConfirmUpdate, SetTeamLibrary, IgnoreVersion } from "../commands/pushImpactCommandHandlers";

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
    const message:SlackFileMessage = {content: clj.renderDiff(diff), fileType: "text", title: `${diff.owner}/${diff.repo}`};
    // TODO CD recommends we not use messageClient.send until slack team-id is removed from the Destination factory
    // const destination: SlackDestination = new SlackDestination(ctx.teamId);
    // ctx.messageClient.send(message,destination.addressChannel(diff.channel));
    ctx.messageClient.addressChannels(message as SlackMessage, diff.channel);
}

function libraryEditorChoiceMessage(ctx: HandlerContext, diff: impact.Diff): (s:string, library: {name: string, version: string}) => Promise<any> {
    return (text:string, library: {name: string, version: string}) => {
        const message:SlackMessage = {
            attachments: [
                {text: text,
                 color: "#45B254",
                 fallback: "none",
                 mrkdwn_in: ["text"],
                 actions: [
                    buttonForCommand(
                        {text: "Accept"},
                        ConfirmUpdate,
                        {owner: diff.owner,
                         repo: diff.repo,
                         name: library.name,
                         version: library.version}),
                    buttonForCommand(
                        {text: "Set as target"},
                        SetTeamLibrary,
                        {name: library.name,
                         version: library.version}
                    ),
                    buttonForCommand(
                        {text: "Ignore"},
                        IgnoreVersion,
                        {name: library.name,
                         version: library.version}
                    )
                 ],
                 }
            ]
        };
        return ctx.messageClient.addressChannels(message, diff.channel);
    };
}

function checkLibraryGoals(ctx: HandlerContext, diff: impact.Diff): void {
    impact.checkLibraryGoals(
        queryPreferences(ctx.graphClient),
        libraryEditorChoiceMessage(ctx,diff),
        diff
    );
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
