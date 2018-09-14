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
    HandlerContext,
    logger,
    NoParameters,
    OnEvent,
    QueryNoCacheOptions,
    SlackFileMessage,
    subscription,
    SuccessPromise,
} from "@atomist/automation-client";
import * as impact from "@atomist/clj-editors";
import * as clj from "@atomist/clj-editors";
import {
    actionableButton,
    EventHandlerRegistration,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import { footer } from "../../support/util";
import {
    GetFingerprintData,
    PushImpactEvent,
} from "../../typings/types";
import {
    ConfirmUpdate,
    IgnoreVersion,
    queryPreferences,
    SetTeamLibrary,
} from "../commands/pushImpactCommandHandlers";

function forFingerprint(s: string): (fp: clj.FP) => boolean {
    return fp => {
        logger.info(`check fp ${fp.name}`);
        return (fp.name === s);
    };
}

function forFingerprints(...s: string[]): (fp: clj.FP) => boolean {
    return fp => {
        logger.info(`check fp ${fp.name} against ${s}`);
        const m = s.map((n: string) => (fp.name === n))
            .reduce((acc, v) => acc || v);
        logger.info(`match value:  ${m}`);
        return m;
    };
}

function getFingerprintDataCallback(ctx: HandlerContext): (sha: string, name: string) => Promise<string> {
    return (sha, name) => {
        return ctx.graphClient.query<GetFingerprintData.Query, GetFingerprintData.Variables>({
            name: "GetFingerprintData",
            variables: {
                sha,
                name,
            },
            options: QueryNoCacheOptions,
        })
            .then(result => {
                logger.info(`getFingerprintData:  got successful result ${result}`);
                const fingerprints =
                    _.get(result, "Commit[0].fingerprints") as GetFingerprintData.Fingerprints[];
                if (fingerprints) {
                    return fingerprints[0].data;
                }
                return "{}";
            })
            .catch(reason => {
                logger.info(`error getting fingerprint data ${reason}`);
                return "{}";
            });
    };
}

async function renderDiffSnippet(ctx: HandlerContext, diff: impact.Diff) {
    const message: SlackFileMessage = {
        content: clj.renderDiff(diff),
        fileType: "text",
        title: `${diff.owner}/${diff.repo}`,
    };
    return ctx.messageClient.addressChannels(message as SlackMessage, diff.channel);
}

function libraryEditorChoiceMessage(ctx: HandlerContext, diff: impact.Diff):
    (s: string, action: { library: { name: string, version: string }, current: string }) => Promise<any> {
    return async (text, action) => {
        const message: SlackMessage = {
            attachments: [
                {
                    author_name: "New Library Target",
                    text,
                    color: "#45B254",
                    fallback: "New Library Target",
                    mrkdwn_in: ["text"],
                    actions: [
                        actionableButton(
                            { text: "Accept" },
                            ConfirmUpdate,
                            {
                                owner: diff.owner,
                                repo: diff.repo,
                                name: action.library.name,
                                version: action.library.version,
                            }),
                        actionableButton(
                            { text: "Set as Target" },
                            SetTeamLibrary,
                            {
                                name: action.library.name,
                                version: action.current,
                            },
                        ),
                        actionableButton(
                            { text: "Ignore" },
                            IgnoreVersion,
                            {
                                name: action.library.name,
                                version: action.library.version,
                            },
                        ),
                    ],
                    footer: footer(),
                },
            ],
        };
        // return ctx.messageClient.send(message, await addressSlackChannelsFromContext(ctx, diff.channel));
        return ctx.messageClient.addressChannels(message, diff.channel);
    };
}

async function checkLibraryGoals(ctx: HandlerContext, diff: clj.Diff): Promise<any> {
    return clj.checkLibraryGoals(
        queryPreferences(ctx.graphClient),
        libraryEditorChoiceMessage(ctx, diff),
        diff,
    );
}

const PushImpactHandle: OnEvent<PushImpactEvent.Subscription> = async (event, ctx) => {
    await clj.processPushImpact(
        event,
        getFingerprintDataCallback(ctx),
        [
            {
                selector: forFingerprints(
                    "clojure-project-deps", 
                    "maven-project-deps", 
                    "npm-project-deps"),
                action: async (diff: clj.Diff) => {
                    return checkLibraryGoals(ctx, diff);
                },
                diffAction: async (diff: clj.Diff) => {
                    return renderDiffSnippet(ctx, diff);
                },
            },
            {
                selector: forFingerprints(
                    "clojure-project-coordinates", 
                    "maven-project-coordinates", 
                    "npm-project-coordinates"),
                action: async (diff: clj.Diff) => {
                    return;
                },
                diffAction: async (diff: clj.Diff) => {
                    return ctx.messageClient.addressChannels(
                        `change in ${diff.from.name} project coords ${clj.renderData(diff.data)}`, 
                        diff.channel);
                },
            },
        ],
    );
    return SuccessPromise;
};

export const PushImpactHandler: EventHandlerRegistration<PushImpactEvent.Subscription, NoParameters> = {
    name: "PushImpactHandler",
    description: "Register push impact handling functions",
    subscription: subscription("PushImpactEvent"),
    listener: PushImpactHandle,
};
