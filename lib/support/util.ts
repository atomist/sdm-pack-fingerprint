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
    HandlerContext,
    SlackFileMessage,
} from "@atomist/automation-client";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    Diff,
    renderDiff,
} from "@atomist/clj-editors";

export function comparator(path: string): (a: any, b: any) => number {
    return (a, b) => {
        const x = _.get(a, path);
        const y = _.get(b, path);
        return x < y ? -1 : x > y ? 1 : 0;
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
