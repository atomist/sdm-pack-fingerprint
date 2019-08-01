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
import { codeLine } from "@atomist/slack-messages";
import { toName } from "../adhoc/preferences";
import {
    Aspect,
    Diff,
    DiffSummary,
    FP,
    Vote,
} from "../machine/Aspect";
import {
    aspectOf,
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

type MessageIdMaker = (shas: string[], coordinate: GitCoordinate) => string;

export const updateableMessage: MessageIdMaker = (shas, coordinate: GitCoordinate) => {
    return consistentHash([...shas, coordinate.owner, coordinate.repo]);
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

export function applyFingerprintTitle(fp: FP, aspects: Aspect[]): string {
    const aspect = aspectOf(fp, aspects);
    if (!!aspect) {
        return `Apply fingerprint ${displayName(aspect, fp)} (${displayValue(aspect, fp)})`;
    } else {
        return `Apply fingerprint ${fp.name}`;
    }
}

export function prBody(vote: Vote, aspects: Aspect[]): string {
    const title: string =
        orDefault(
            () => vote.summary.title,
            applyFingerprintTitle(vote.fpTarget, aspects));
    const description: string =
        orDefault(
            () => vote.summary.description,
            `no summary`);
    const fingerprint = toName(vote.fpTarget.type, vote.fpTarget.name);
    const intro = `Apply target fingerprint ${codeLine(fingerprint)}:`;
    return `${intro}\n\n#### ${title}\n${description}\n\n[fingerprint:${fingerprint}=${vote.fpTarget.sha}]`;
}
