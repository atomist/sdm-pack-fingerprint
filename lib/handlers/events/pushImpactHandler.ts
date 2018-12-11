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
import * as fingerprints from "../../../fingerprints/index";
import { queryPreferences } from "../../adhoc/preferences";
import { FingerprintHandler } from "../../machine/FingerprintSupport";
import { footer } from "../../support/util";
import {
    GetFingerprintData,
    PushImpactEvent,
} from "../../typings/types";
import { ConfirmUpdate } from "../commands/confirmUpdate";
import { IgnoreVersion } from "../commands/ignoreVersion";
import { SetTeamLibrary } from "../commands/setLibraryGoal";

export function forFingerprints(...s: string[]): (fp: fingerprints.FP) => boolean {
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
                const fps =
                    _.get(result, "Commit[0].fingerprints") as GetFingerprintData.Fingerprints[];
                if (fps) {
                    return fps[0].data;
                }
                return "{}";
            })
            .catch(reason => {
                logger.info(`error getting fingerprint data ${reason}`);
                return "{}";
            });
    };
}

export async function renderDiffSnippet(ctx: HandlerContext, diff: fingerprints.Diff) {
    const message: SlackFileMessage = {
        content: fingerprints.renderDiff(diff),
        fileType: "text",
        title: `${diff.owner}/${diff.repo}`,
    };
    return ctx.messageClient.addressChannels(message as SlackMessage, diff.channel);
}

function libraryEditorChoiceMessage(ctx: HandlerContext, diff: fingerprints.Diff):
    (s: string, action: { library: { name: string, version: string }, current: string }) => Promise<any> {
    return async (text, action) => {
        const msgId = fingerprints.consistentHash([action.library.name, action.library.version, diff.channel, diff.owner, diff.repo, action.current]);
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
        return ctx.messageClient.addressChannels(message, diff.channel, { id: msgId });
    };
}

export async function checkLibraryGoals(ctx: HandlerContext, diff: fingerprints.Diff): Promise<any> {
    return fingerprints.checkLibraryGoals(
        queryPreferences(ctx.graphClient),
        libraryEditorChoiceMessage(ctx, diff),
        diff,
    );
}

/**
 * handlers are usually defined by the sdm pulling in this pack
 * by default, we always add the checkLibraryGoals handler for
 * some of our out of the box fingerprints
 *
 * @param handlers
 */
function pushImpactHandle(handlers: FingerprintHandler[]): OnEvent<PushImpactEvent.Subscription> {
    return async (event, ctx) => {
        const votes = await fingerprints.processPushImpact(
            event,
            getFingerprintDataCallback(ctx),
            [
                ...handlers.map(h => {
                    if (h.diffHandler) {
                        return {
                            selector: h.selector,
                            diffAction: (diff: fingerprints.Diff) => {
                                return h.diffHandler(ctx, diff);
                            },
                        };
                    } else {
                        return {
                            selector: h.selector,
                            action: (diff: fingerprints.Diff) => {
                                return h.handler(ctx, diff);
                            },
                        };
                    }
                }),
            ],
        );

        const filteredVotes = [].concat(...votes);

        handlers.map(async h => {
            if (h.ballot) {
                await h.ballot(ctx, filteredVotes);
            }
        });

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
