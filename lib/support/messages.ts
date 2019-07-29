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
import {
    consistentHash,
} from "@atomist/clj-editors";
import {
    Aspect,
    Diff,
    DiffSummary,
    FP,
    Vote,
} from "../machine/Aspect";
import {
    applyToAspect,
    displayName,
    displayValue,
} from "../machine/Aspects";
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
};

function displayFingerprint(aspect: Aspect, fp: FP): string {
    if (aspect.toDisplayableFingerprint) {
        return aspect.toDisplayableFingerprint(fp);
    } else {
        return JSON.stringify(fp.data);
    }
}

/**
 * get a diff summary if any registrations support one for this Fingerprint type
 */
export function getDiffSummary(diff: Diff, target: FP, aspect: Aspect): undefined | DiffSummary {

    try {
        if (aspect.summary) {
            return aspect.summary(diff, target);
        } else {
            return {
                title: "Target diff",
                description: `from ${displayFingerprint(aspect, diff.from)} to ${displayFingerprint(aspect, diff.to)}`,
            };
        }
    } catch (e) {
        logger.warn(`failed to create summary: ${e}`);
    }

    return undefined;
}

export function applyFingerprintTitle(fp: FP): string {
    try {
        return `Apply fingerprint ${applyToAspect(fp, displayName)} (${applyToAspect(fp, displayValue)})`;
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
