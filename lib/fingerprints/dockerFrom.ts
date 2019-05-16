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
    astUtils,
    logger,
} from "@atomist/automation-client";
import { DockerFileParser } from "@atomist/sdm-pack-docker";
import {
    ApplyFingerprint,
    ExtractFingerprint,
    FP,
    renderData,
    sha256,
} from "../..";
import { FingerprintRegistration } from "../machine/fingerprintSupport";

export const dockerBaseFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("Dockerfile");

    if (file && await file.getContent() !== "") {
        const imageName: string[] = await astUtils.findValues(
            p, DockerFileParser, "Dockerfile", "//FROM/image/name");
        const imageVersion: string[] = await astUtils.findValues(
            p, DockerFileParser, "Dockerfile", "//FROM/image/tag");

        const data = { image: imageName[0], version: imageVersion[0] };
        const fp: FP = {
            name: `docker-base-image-${imageName[0]}`,
            abbreviation: `dbi-${imageName[0]}`,
            version: "0.0.1",
            data,
            sha: sha256(JSON.stringify(data)),
        };

        // bug opened and fix coming
        (fp as any).value = data;

        return fp;
    } else {

        return undefined;
    }
};

export const applyDockerBaseFingerprint: ApplyFingerprint = async (p, fp) => {
    logger.info(`apply ${renderData(fp)} to ${p.id.url}`);

    interface DockerFP {
        name: string;
        version: string;
    }

    const newFP = fp.data as DockerFP;

    try {
        await astUtils.doWithAllMatches(
            p,
            DockerFileParser,
            "Dockerfile",
            "//FROM/image/tag",
            n => n.$value = newFP.version,
        );
        return (true);
    } catch (e) {
        logger.error(e);
        return false;
    }
};

export const DockerFrom: FingerprintRegistration = {
    apply: applyDockerBaseFingerprint,
    extract: dockerBaseFingerprint,
    selector: myFp => myFp.name.startsWith("docker-base-image"),
    toDisplayableString: fp => fp.name,
};
