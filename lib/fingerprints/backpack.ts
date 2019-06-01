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
    FP,
    renderData,
    sha256,
} from "@atomist/clj-editors";
import {
    ApplyFingerprint,
    ExtractFingerprint,
} from "../..";
import { Feature } from "../machine/Feature";

export const backpackFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("package.json");

    if (file) {

        const packagejson = JSON.parse(await file.getContent());

        // tslint:disable-next-line:no-string-literal
        const data: any = packagejson["backpack-react-scripts"]["externals"];

        const fp: FP = {
            name: "backpack-react-scripts",
            abbreviation: "backpack",
            version: "0.0.1",
            data: packagejson["backpack-react-scripts"].externals,
            sha: sha256(JSON.stringify(data)),
        };

        // bug opened and fix coming
        (fp as any).value = data;

        return fp;
    } else {

        return undefined;
    }
};

export const applyBackpackFingerprint: ApplyFingerprint = async (p, fp) => {
    logger.info(`Apply ${renderData(fp)} to project at ${p.id.url}`);

    try {
        if (await p.hasFile("package.json")) {
            const file = await p.getFile("package.json");
            const packagejson = JSON.parse(await file.getContent());

            // tslint:disable-next-line:no-string-literal
            packagejson["backpack-react-scripts"]["externals"] = fp.data;

            await file.setContent(JSON.stringify(packagejson, undefined, 2));
            return true;
        } else {
            return false;
        }
    } catch (error) {
        logger.error(`caught error ${error}`);
        return false;
    }
};

export const Backpack: Feature = {
    displayName: "Backpack",
    extract: backpackFingerprint,
    apply: applyBackpackFingerprint,
    selector: fp => fp.name === "backpack-react-scripts",
    toDisplayableFingerprint: fp => fp.name,
};
