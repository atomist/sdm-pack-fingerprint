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

import { sha256 } from "@atomist/clj-editors";

import * as assert from "assert";
import { cachingVirtualProjectFinder } from "../../../lib/fingerprints/virtual-project/cachingVirtualProjectFinder";
import { fileNamesVirtualProjectFinder } from "../../../lib/fingerprints/virtual-project/fileNamesVirtualProjectFinder";
import {
    makeApplyVirtualProjectAware,
    makeExtractorVirtualProjectAware,
    makeVirtualProjectAware,
} from "../../../lib/fingerprints/virtual-project/makeVirtualProjectAware";
import {
    ApplyFingerprint,
    Aspect,
    ExtractFingerprint,
} from "../../../lib/machine/Aspect";
import { tempProject } from "./tempProject";

const extractThing: ExtractFingerprint = async p => {
    const t = await p.getFile("Thing");
    if (!t) {
        return undefined;
    }
    const data = { path: t.path, content: await t.getContent() };
    return {
        name: "thing",
        type: "thing",
        data,
        sha: sha256(JSON.stringify(data)),
    };
};

const applyThing: ApplyFingerprint<{ path: string, content: string }> = async (p, papi) => {
    const fpi = papi.parameters.fp;
    await p.addFile(fpi.data.path, fpi.data.content);
    return p;
};

const MavenAndNodeSubprojectFinder = cachingVirtualProjectFinder(
    fileNamesVirtualProjectFinder("pom.xml", "package.json"));

describe("makeVirtualProjectAware", () => {

    describe("extract", () => {

        it("should behave as normal when zero files", async () => {
            const p = await tempProject();
            const extracted = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(extracted.length, 0);
        });

        it("should behave as normal on root", async () => {
            const data = { path: "Thing", content: "d" };
            const p = await tempProject(data);
            const fps = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(fps.length, 1);
            const fp = fps[0];
            assert.strictEqual(fp.path, undefined);
            assert.deepStrictEqual(fp.data, data,
                `Fingerprint was ${JSON.stringify(fp)}`);
        });

        it("should find one in subproject root", async () => {
            const data = { path: "x/Thing", content: "d" };
            const p = await tempProject(
                { path: "x/pom.xml", content: "xml" },
                data);
            const fps = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(fps.length, 1);
            const fp = fps[0];
            assert.strictEqual(fp.path, "x");
            assert.deepStrictEqual(fp.data, { path: "Thing", content: "d" },
                `Fingerprint was ${JSON.stringify(fp)}`);
        });

    });

    describe("apply", () => {

        it("should behave as normal when zero files", async () => {
            const p = await tempProject();
            const apply = makeApplyVirtualProjectAware(applyThing, MavenAndNodeSubprojectFinder);
            const data = { path: "Thing", content: "One" };
            await apply(p, { parameters: { fp: { data } } } as any);
            assert.strictEqual(await p.totalFileCount(), 1);
        });

        it("should add in single subproject root", async () => {
            const file1 = { path: "x/Thing", content: "d" };
            const p = await tempProject(
                { path: "x/pom.xml", content: "xml" },
                { path: "y/whatever", content: "stuff" },
                file1);
            assert.strictEqual(await p.totalFileCount(), 3);

            const apply = makeApplyVirtualProjectAware(applyThing, MavenAndNodeSubprojectFinder);

            const data = { path: "AnotherThing", content: "One" };
            await apply(p, { parameters: { fp: { data } } } as any);
            assert.strictEqual(await p.totalFileCount(), 4);
            assert(await p.getFile("x/AnotherThing"));
        });

    });

    describe("aspect", () => {

        it("should return aspect when no virtual project finder is supplied", async () => {
            const aspect: Aspect = {
                name: "thing",
                displayName: "thinger",
                stats: {
                    basicStatsPath: "count",
                },
                extract: extractThing,
                apply: applyThing,
                toDisplayableFingerprint: fp => "thingie",
                toDisplayableFingerprintName: fp => "thingish",
            };
            const multified = makeVirtualProjectAware(aspect, undefined);
            assert.strictEqual(multified, aspect);
        });

        it("should allow no apply", async () => {
            const aspect: Aspect = {
                name: "thing",
                displayName: "thinger",
                stats: {
                    basicStatsPath: "count",
                },
                extract: extractThing,
                toDisplayableFingerprint: fp => "thingie",
                toDisplayableFingerprintName: fp => "thingish",
            };
            const multified = makeVirtualProjectAware(aspect, MavenAndNodeSubprojectFinder);
            assert.strictEqual(multified.apply, undefined);
        });

        it("should preserve properties", async () => {
            const aspect: Aspect = {
                name: "thing",
                displayName: "thinger",
                stats: {
                    basicStatsPath: "count",
                },
                extract: extractThing,
                apply: applyThing,
                toDisplayableFingerprint: fp => "thingie",
                toDisplayableFingerprintName: fp => "thingish",
            };
            const multified = makeVirtualProjectAware(aspect, MavenAndNodeSubprojectFinder);
            assert.strictEqual(multified.name, aspect.name);
            assert.strictEqual(multified.displayName, aspect.displayName);
            assert.strictEqual(multified.toDisplayableFingerprintName, aspect.toDisplayableFingerprintName);
            assert.strictEqual(multified.toDisplayableFingerprint, aspect.toDisplayableFingerprint);
            assert.deepStrictEqual(multified.extract.toString(),
                makeExtractorVirtualProjectAware(aspect.extract, MavenAndNodeSubprojectFinder).toString());
            assert.deepStrictEqual(multified.apply.toString(),
                makeApplyVirtualProjectAware(aspect.apply, MavenAndNodeSubprojectFinder).toString());
        });

    });

});
