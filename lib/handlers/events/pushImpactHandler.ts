/*
 * Copyright © 2019 Atomist, Inc.
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
    GraphQL,
    HandlerContext,
    logger,
    NoParameters,
    OnEvent,
    QueryNoCacheOptions,
    SlackFileMessage,
    SuccessPromise,
} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    Diff,
    FP,
    processPushImpact,
    renderDiff,
} from "../../../fingerprints";
import { FingerprintHandler } from "../../machine/fingerprintSupport";
import {
    GetFingerprintData,
    PushImpactEvent,
} from "../../typings/types";

export function forFingerprints(...s: string[]): (fp: FP) => boolean {
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
                logger.debug(`getFingerprintData:  got successful result ${result}`);
                const fps =
                    _.get(result, "Commit[0].fingerprints") as GetFingerprintData.Fingerprints[];
                if (fps) {
                    return fps[0].data;
                }
                return "{}";
            })
            .catch(reason => {
                logger.error(`error getting fingerprint data ${reason}`);
                return "{}";
            });
    };
}

export async function renderDiffSnippet(ctx: HandlerContext, diff: Diff): Promise<void> {
    const message: SlackFileMessage = {
        content: renderDiff(diff),
        fileType: "text",
        title: `${diff.owner}/${diff.repo}`,
    };
    return ctx.messageClient.addressChannels(message as SlackMessage, diff.channel);
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
        const votes = await processPushImpact(
            event,
            getFingerprintDataCallback(ctx),
            [
                ...handlers.map(h => {
                    if (h.diffHandler) {
                        return {
                            selector: h.selector,
                            diffAction: (diff: Diff) => {
                                return h.diffHandler(ctx, diff) as any;
                            },
                        };
                    } else {
                        return {
                            selector: h.selector,
                            action: (diff: Diff) => {
                                return h.handler(ctx, diff);
                            },
                        };
                    }
                }),
            ],
        );

        const filteredVotes = [].concat(...votes);

        await Promise.all(
            handlers.map(async h => {
                    if (h.ballot) {
                        await h.ballot(
                            ctx,
                            filteredVotes,
                            {
                                owner: event.data.PushImpact[0].push.after.repo.org.owner,
                                repo: event.data.PushImpact[0].push.after.repo.name,
                                sha: event.data.PushImpact[0].push.after.sha,
                                providerId: event.data.PushImpact[0].push.after.repo.org.provider.providerId,
                                branch: event.data.PushImpact[0].push.branch,
                            },
                            event.data.PushImpact[0].push.after.repo.channels[0].name,
                        );
                    }
                },
            ));

        return SuccessPromise;
    };
}

export function pushImpactHandler(handlers: FingerprintHandler[]): EventHandlerRegistration<PushImpactEvent.Subscription, NoParameters> {
    return {
        name: "PushImpactHandler",
        description: "Register push impact handling functions",
        subscription: GraphQL.subscription("PushImpactEvent"),
        listener: pushImpactHandle(handlers),
    };
}
