import {sha256} from "@atomist/clj-editors";
import {makeApplyVirtualProjectAware, makeExtractorVirtualProjectAware} from "../../../lib/fingerprints/virtual-project/makeVirtualProjectAware";
import {ApplyFingerprint, ExtractFingerprint, FP} from "../../../lib/machine/Aspect";

import * as assert from "assert";
import {fileNamesVirtualProjectFinder} from "../../../lib/fingerprints/virtual-project/fileNamesVirtualProjectFinder";
import {tempProject} from "./tempProject";

const extractThing: ExtractFingerprint = async p => {
    const t = await p.getFile("Thing");
    if (!t) {
        return undefined;
    }
    const data = {path: t.path, content: await t.getContent()};
    return {
        name: "thing",
        type: "thing",
        data,
        sha: sha256(JSON.stringify(data)),
    };
};

const applyThing: ApplyFingerprint<FP<{ path: string, content: string }>> = async (p, fpi) => {
    await p.addFile(fpi.data.path, fpi.data.content);
    return true;
};

const MavenAndNodeSubprojectFinder = fileNamesVirtualProjectFinder("pom.xml", "package.json");

describe("makeVirtualProjectAware", () => {

    describe("extract", () => {

        it("should behave as normal when zero files", async () => {
            const p = await tempProject();
            const extracted = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(extracted.length, 0);
        });

        it("should behave as normal on root", async () => {
            const data = {path: "Thing", content: "d"};
            const p = await tempProject(data);
            const fps = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(fps.length, 1);
            const fp = fps[0];
            assert.strictEqual(fp.path, undefined);
            assert.deepStrictEqual(fp.data, data,
                `Fingerprint was ${JSON.stringify(fp)}`);
        });

        it("should find one in subproject root", async () => {
            const data = {path: "x/Thing", content: "d"};
            const p = await tempProject(
                {path: "x/pom.xml", content: "xml"},
                data);
            const fps = await makeExtractorVirtualProjectAware(extractThing, MavenAndNodeSubprojectFinder)(p);
            assert.strictEqual(fps.length, 1);
            const fp = fps[0];
            assert.strictEqual(fp.path, "x");
            assert.deepStrictEqual(fp.data, {path: "Thing", content: "d"},
                `Fingerprint was ${JSON.stringify(fp)}`);
        });

    });

    describe("apply", () => {

        it("should behave as normal when zero files", async () => {
            const p = await tempProject();
            const apply = makeApplyVirtualProjectAware(applyThing, MavenAndNodeSubprojectFinder);
            const data = {path: "Thing", content: "One"};
            await apply(p, {data} as any);
            assert.strictEqual(await p.totalFileCount(), 1);
        });

        it("should add in single subproject root", async () => {
            const file1 = {path: "x/Thing", content: "d"};
            const p = await tempProject(
                {path: "x/pom.xml", content: "xml"},
                {path: "y/whatever", content: "stuff"},
                file1);
            assert.strictEqual(await p.totalFileCount(), 3);

            const apply = makeApplyVirtualProjectAware(applyThing, MavenAndNodeSubprojectFinder);

            const data = {path: "AnotherThing", content: "One"};
            await apply(p, {data} as any);
            assert.strictEqual(await p.totalFileCount(), 4);
            assert(await p.getFile("x/AnotherThing"));
        });

    });

});
