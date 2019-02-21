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
    LoggingProgressLog,
    spawnLog,
} from "@atomist/sdm";
import {
    ApplyFingerprint,
    ExtractFingerprint,
    FP,
    sha256,
} from "../..";
import { DiffSummaryFingerprint } from "../machine/fingerprintSupport";
import { logger } from "@atomist/automation-client";

export function getNpmDepFingerprint(lib: string, version: string): FP {

    const data = [lib, version];

    return {
        name: `test-npm-project-dep::${lib.replace("@", "").replace("/", "::")}`,
        abbreviation: "npmdeps",
        version: "0.0.1",
        data,
        sha: sha256(JSON.stringify(data)),
    };
}

export const createNpmDepsFingerprints: ExtractFingerprint = async p => {

    const file = await p.getFile("package.json");

    if (file) {

        const jsonData = JSON.parse(await file.getContent());

        const dependencies: any[] = jsonData.dependencies || [];

        const fingerprints: FP[] = [];

        for (const [lib, version] of Object.entries(dependencies)) {
            fingerprints.push(getNpmDepFingerprint(lib, version));
        }

        const coords = JSON.stringify({ name: jsonData.name, version: jsonData.version });
        fingerprints.push(
            {
                name: "test-npm-project-coordinates",
                abbreviation: "npm-project-coords",
                version: "0.0.1",
                data: coords,
                sha: sha256(coords),
            },
        );

        return fingerprints;
    } else {
        return undefined;
    }
};

export const applyNpmDepsFingerprint: ApplyFingerprint = async (p, fp) => {
    const file = await p.getFile("package.json");
    if (file) {
        const log = new LoggingProgressLog("npm install");
        const result = await spawnLog(
            "npm",
            ["install", `${fp.data[0]}@${fp.data[1]}`, "--save-exact"],
            {
                cwd: p.baseDir,
                log,
                logCommand: false,
            });
        logger.info("finished npm instsall");
        log.flush();
        logger.info(log.log);
        return result.code === 0;
    } else {
        return false;
    }
};

/* tslint:disable:max-line-length */
export const diffNpmDepsFingerprints: DiffSummaryFingerprint = (diff, target) => {
    return {
        title: "New Library Target",
        description:
            `Target version for library *${diff.from.data[0]}* is *${target.data[1]}*.\nCurrently *${diff.from.data[1]}* in *${diff.owner}/${diff.repo}*`,
    };
};
