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

import { logger } from "@atomist/automation-client";
import { consistentHash, Diff, FP, Vote } from "@atomist/clj-editors";
import { DiffSummary, Feature } from "../machine/Feature";
import { applyToFeature, displayName, displayValue } from "../machine/Features";
import { orDefault } from "./util";

export interface GitCoordinate {
    owner: string;
    repo: string;
    sha: string;
    providerId: string;
    branch?: string;
}

type MessageIdMaker = (shas: string[], coordinate: GitCoordinate, channel: string) => string;

export const updateableMessage: MessageIdMaker = (shas, coordinate: GitCoordinate, channel: string) => {
    return consistentHash([...shas, channel, coordinate.owner, coordinate.repo]);
    // return _.times(20, () => _.random(35).toString(36)).join("");
};

/**
 * get a diff summary if any registrations support one for this Fingerprint type
 */
export function getDiffSummary(diff: Diff, target: FP, feature: Feature): undefined | DiffSummary {

    try {
        if (feature.summary) {
            return feature.summary(diff, target);
        } else {
            return {
                title: "Target diff",
                description: `from ${diff.from.data} to ${diff.to.data}`,
            };
        }
    } catch (e) {
        logger.warn(`failed to create summary: ${e}`);
    }

    return undefined;
}

export function applyFingerprintTitle(fp: FP): string {
    try {
        return `Apply fingerprint ${applyToFeature(fp, displayName)} (${applyToFeature(fp, displayValue)})`;
    } catch (ex) {
        return `Apply fingerprint ${fp.name}`;
    }
}

export function prBody(vote: Vote): string {
    const title: string =
        orDefault(
            () => vote.summary.title,
            applyFingerprintTitle(vote.fpTarget));
    const description: string =
        orDefault(
            () => vote.summary.description,
            `no summary`);

    return `#### ${title}\n${description}`;
}
