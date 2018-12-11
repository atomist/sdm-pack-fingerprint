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

import { logger } from "@atomist/automation-client";
import {
    DockerfileParser,
    From,
} from "dockerfile-ast";
import { ApplyFingerprint, ExtractFingerprint, FP, renderData, sha256 } from "../..";

interface DockerFPImageData {
    image: string;
    version: number;
}

export const dockerBaseFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("Dockerfile");

    if (file && await file.getContent() !== "") {

        const dockerfile = DockerfileParser.parse(await file.getContent());
        const instructions = dockerfile.getInstructions();
        let baseImage: string = "";
        let imageVersion: string = "";

        for (const instruction of instructions) {
            if ("FROM" === instruction.getKeyword()) {
                const rawData = (instruction as From).getImage();
                baseImage = rawData.split(":")[0];
                imageVersion = rawData.split(":")[1];
            }
            logger.info(`instruction:  ${instruction.getKeyword}  ${instruction.getInstruction()}`);
        }

        const data = JSON.stringify({image: baseImage, version: imageVersion});
        const fp: FP = {
            name: `docker-base-image-${baseImage}`,
            abbreviation: `dbi-${baseImage}`,
            version: "0.0.1",
            data,
            sha: sha256(data),
        };

        // bug opened and fix coming
        (fp as any).value = data;

        return fp;
    } else {

        return null;
    }
};

export const applyDockerBaseFingerprint: ApplyFingerprint = async (p, fp) => {
    logger.info(`apply ${renderData(fp)} to ${p.baseDir}`);

    const file = await p.getFile("Dockerfile");
    let dockerFile = await file.getContent();
    const data: DockerFPImageData = JSON.parse(fp.data);
    dockerFile = dockerFile
        .replace(/(\s+)?FROM.*/i, `\nFROM ${data.image}:${data.version}`);
    await file.setContent(dockerFile);

    return true;
};
