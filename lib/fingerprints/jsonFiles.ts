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
    ApplyFingerprint,
    ExtractFingerprint,
    FP,
    sha256,
} from "../..";
import { Feature } from "../machine/Feature";

export function createFileFingerprint(...filenames: string[]): ExtractFingerprint {
    return async p => {
        const fps: FP[] = [];
        await Promise.all(
            filenames.map(async filename => {
                const file = await p.getFile(filename);

                if (file) {
                    const fileData = await file.getContent();
                    const jsonData = JSON.parse(fileData);
                    fps.push(
                        {
                            name: `${JsonFile.name}-${filename}`,
                            abbreviation: `file-${filename}`,
                            version: "0.0.1",
                            data: {
                                content: fileData,
                                filename,
                            },
                            sha: sha256(JSON.stringify(jsonData)),
                        },
                    );
                }
            },
            ));

        return fps;
    };
}

export const applyFileFingerprint: ApplyFingerprint = async (p, fp) => {
    const file = await p.getFile(fp.data.filename);

    if (file) {
        logger.info("Update content on an existing file");
        await file.setContent(fp.data.content);
        return true;
    } else {
        logger.info("Creating new file '%s'", fp.data.filename);
        await p.addFile(fp.data.filename, fp.data.content);
        return true;
    }
};

export const JsonFile: Feature = {
    displayName: "JSON files",
    name: "file",
    extract: createFileFingerprint(
        "tslint.json",
        "tsconfig.json"),
    apply: applyFileFingerprint,
    selector: fp => fp.name.startsWith(JsonFile.name),
    toDisplayableFingerprint: fp => fp.name,
};
