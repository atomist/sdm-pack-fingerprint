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
    LocalProject,
    logger,
} from "@atomist/automation-client";
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
import {
    DiffSummaryFingerprint,
    Feature,
} from "../machine/fingerprintSupport";

/**
 * Construct an npmdep fingerprint from the given library and version
 * @param {string} lib
 * @param {string} version
 * @return {FP}
 */
export function getNpmDepFingerprint(lib: string, version: string): FP {
    const data = [lib, version];
    return {
        name: `npm-project-dep::${lib.replace("@", "").replace("/", "::")}`,
        abbreviation: "npmdeps",
        version: "0.0.1",
        data,
        sha: sha256(JSON.stringify(data)),
    };
}

export function constructNpmDepsFingerprintName(lib: string): string {
    return `npm-project-dep::${lib.replace("@", "").replace("/", "::")}`;
}

/**
 * Return the library name in its natural form - e.g. "lodash" or "@types/lodash" or "@atomist/sdm"
 * @param {string} fingerprintName
 * @return {string | undefined}
 */
export function deconstructNpmDepsFingerprintName(fingerprintName: string): string | undefined {
    const regex = /^npm-project-dep::([^:]+)(::.*)?$/;
    const match = regex.exec(fingerprintName);
    if (!match) {
        return undefined;
    }
    if (match[2] !== undefined) {
        const lib = match[2].replace("::", "");
        const owner = match[1];
        return `@${owner}/${lib}`;
    } else {
        const lib = match[1];
        return lib;
    }
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

        const coords = {name: jsonData.name, version: jsonData.version};
        fingerprints.push(
            {
                name: "npm-project-coordinates",
                abbreviation: "npm-project-coords",
                version: "0.0.1",
                data: coords,
                sha: sha256(JSON.stringify(coords)),
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
                cwd: (p as LocalProject).baseDir,
                log,
                logCommand: false,
            });
        logger.info("finished npm install");
        await log.flush();
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

export const NpmDeps: Feature = {
    displayName: "npm dependencies",
    extract: createNpmDepsFingerprints,
    apply: applyNpmDepsFingerprint,
    selector: fp => fp.name.startsWith("npm-project-dep"),
    summary: diffNpmDepsFingerprints,
    toDisplayableFingerprint: fp => fp.data[1],
    toDisplayableFingerprintName: deconstructNpmDepsFingerprintName,
};
