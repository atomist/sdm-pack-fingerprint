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
    SuccessPromise,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import {
    actionableButton,
    EventHandlerRegistration,
} from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import * as clj from "../../../fingerprints/index";
import * as impact from "../../../fingerprints/index";
import { FingerprintHandler } from "../../machine/FingerprintSupport";
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

export function forFingerprints(...s: string[]): (fp: clj.FP) => boolean {
    return fp => {
        const m = s.map((n: string) => (fp.name === n))
            .reduce((acc, v) => acc || v);
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

export async function renderDiffSnippet(ctx: HandlerContext, diff: impact.Diff) {
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
        const msgId = clj.consistentHash([action.library.name, action.library.version, diff.channel, diff.owner, diff.repo, action.current]);
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
                                msgId,
                                owner: diff.owner,
                                repo: diff.repo,
                                name: action.library.name,
                                version: action.library.version,
                            }),
                        actionableButton(
                            { text: "Set as Target" },
                            SetTeamLibrary,
                            {
                                msgId,
                                name: action.library.name,
                                version: action.current,
                                fp: diff.from.name,
                            },
                        ),
                        actionableButton(
                            { text: "Ignore" },
                            IgnoreVersion,
                            {
                                msgId,
                                name: action.library.name,
                                version: action.library.version,
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

async function checkLibraryGoals(ctx: HandlerContext, diff: clj.Diff): Promise<any> {
    return clj.checkLibraryGoals(
        queryPreferences(ctx.graphClient),
        libraryEditorChoiceMessage(ctx, diff),
        diff,
    );
}

function pushImpactHandle(handlers: FingerprintHandler[]): OnEvent<PushImpactEvent.Subscription> {
    return async (event, ctx) => {
        await clj.processPushImpact(
            event,
            getFingerprintDataCallback(ctx),
            [
                ...handlers.map(h => {
                    return {
                        selector: h.selector,
                        diffAction: (diff: clj.Diff) => {
                            return h.diffHandler(ctx, diff);
                        },
                    };
                }),
                {
                    selector: forFingerprints(
                        "clojure-project-deps",
                        "maven-project-deps",
                        "npm-project-deps"),
                    action: async (diff: clj.Diff) => {
                        return checkLibraryGoals(ctx, diff);
                    },
                },
            ],
        );
        return SuccessPromise;
    };
}

export function pushImpactHandler(handlers: FingerprintHandler[]): EventHandlerRegistration<PushImpactEvent.Subscription, NoParameters> {
    return {
        name: "PushImpactHandler",
        description: "Register push impact handling functions",
        subscription: subscription("PushImpactEvent"),
        listener: pushImpactHandle(handlers),
    };
}
