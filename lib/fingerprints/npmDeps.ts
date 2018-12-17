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

import { ChildProcessResult, logger, SuccessIsReturn0ErrorFinder } from "@atomist/automation-client";
import {
    LoggingProgressLog,
    spawnAndWatch,
} from "@atomist/sdm";
import { ApplyFingerprint, ExtractFingerprint, FP, sha256 } from "../..";
import { renderData } from "../../fingerprints";

export function getNpmDepFingerprint(lib: string, version: string): FP {

    const data: string = JSON.stringify([lib, version]);

    return {
        name: `npm-project-dep-${lib}`,
        abbreviation: "npmdeps",
        version: "0.0.1",
        data,
        sha: sha256(data),
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

        const coords = JSON.stringify({name: jsonData.name, version: jsonData.version});
        fingerprints.push(
            {
                name: "npm-project-coordinates",
                abbreviation: "npm-project-coords",
                version: "0.0.1",
                data: coords,
                sha: sha256(coords),
            },
        );

        return fingerprints;
    } else {
        return null;
    }
};

export const applyNpmDepsFingerprint: ApplyFingerprint = async (p, fp) => {
    const file = await p.getFile("package.json");
    if (file) {

        logger.info(`use npm to install exact version of ${fp.data[0]}@${fp.data[1]}`);
        const log = new LoggingProgressLog("npm install");
        const result: ChildProcessResult =  await spawnAndWatch(
            {
                command: "npm",
                args: ["install", `${fp.data[0]}@${fp.data[1]}`, "--save-exact"],
            },
            {
                cwd: p.baseDir,
            },
            log,
            {
                errorFinder: SuccessIsReturn0ErrorFinder,
                logCommand: false,
            });
        logger.info(`${renderData(result)}`);

        return result.code === 0;
    } else {
        return false;
    }
};
