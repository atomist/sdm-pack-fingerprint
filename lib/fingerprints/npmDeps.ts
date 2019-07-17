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
import _ = require("lodash");
import {
    ApplyFingerprint,
    ExtractFingerprint,
    FP,
    sha256,
    Vote,
} from "../..";
import { setNewTargetFingerprint } from "../handlers/commands/updateTarget";
import {
    Aspect,
    DiffSummaryFingerprint,
} from "../machine/Aspect";
import {
    DefaultTargetDiffHandler,
    diffOnlyHandler,
} from "../machine/fingerprintSupport";

/**
 * Construct an npmdep fingerprint from the given library and version
 * @param {string} lib
 * @param {string} version
 * @return {FP}
 */
export function createNpmDepFingerprint(lib: string, version: string): FP {
    const data = [lib, version];
    return {
        type: NpmDepsName,
        name: `${constructNpmDepsFingerprintName(lib)}`,
        abbreviation: "npmdeps",
        version: "0.0.1",
        data,
        sha: sha256(JSON.stringify(data)),
    };
}

export function constructNpmDepsFingerprintName(lib: string): string {
    return `${lib.replace("@", "").replace("/", "::")}`;
}

/**
 * Return the library name in its natural form - e.g. "lodash" or "@types/lodash" or "@atomist/sdm"
 * @param {string} fingerprintName
 * @return {string | undefined}
 */
export function deconstructNpmDepsFingerprintName(fingerprintName: string): string | undefined {
    const regex = /^([^:]+)(::.*)?$/;
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
        const dependencies = _.merge(jsonData.dependencies || {}, jsonData.devDependencies || {});

        const fingerprints: FP[] = [];

        for (const [lib, version] of Object.entries(dependencies)) {
            fingerprints.push(createNpmDepFingerprint(lib, version as string));
        }

        return fingerprints;
    } else {
        return undefined;
    }
};

export const createNpmCoordinatesFingerprint: ExtractFingerprint = async p => {
    const file = await p.getFile("package.json");

    if (file) {
        const jsonData = JSON.parse(await file.getContent());

        const fingerprints: FP[] = [];

        const coords = { name: jsonData.name, version: jsonData.version };
        fingerprints.push(
            {
                name: NpmCoordinates.name,
                abbreviation: NpmCoordinates.name,
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

/* tslint:disable:max-line-length */
export const diffNpmCoordinatesFingerprints: DiffSummaryFingerprint = (diff, target) => {
    return {
        title: "New Package Coordinate Updated",
        description: `from ${diff.from.data} to ${diff.to.data}`,
    };
};

const NpmDepsName = "npm-project-deps";

export const NpmDeps: Aspect = {
    displayName: "npm dependencies",
    name: NpmDepsName,
    extract: createNpmDepsFingerprints,
    apply: applyNpmDepsFingerprint,
    summary: diffNpmDepsFingerprints,
    toDisplayableFingerprint: fp => fp.data[1],
    toDisplayableFingerprintName: deconstructNpmDepsFingerprintName,
    workflows: [
        DefaultTargetDiffHandler,
    ],
};

export const NpmCoordinates: Aspect = {
    displayName: "npm coordinates",
    name: "npm-project-coordinates",
    extract: createNpmCoordinatesFingerprint,
    summary: diffNpmCoordinatesFingerprints,
    toDisplayableFingerprint: fp => fp.data,
    workflows: [
        diffOnlyHandler(
            (ctx, diff) => {
                if (diff.channel) {
                    return setNewTargetFingerprint(
                        ctx.context,
                        NpmDeps,
                        createNpmDepFingerprint(diff.to.data.name, diff.to.data.version),
                        diff.channel);
                } else {
                    return new Promise<Vote>(
                        (resolve, reject) => {
                            resolve({ abstain: true });
                        },
                    );
                }
            },
        ),
    ],
};
