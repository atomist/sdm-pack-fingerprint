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

import { InMemoryProject } from "@atomist/automation-client";
import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import * as assert from "assert";
import {
    constructNpmDepsFingerprintName,
    createNpmDepFingerprint,
} from "../../lib/fingerprints/npmDeps";
import {
    Aspect,
    ExtractFingerprint,
} from "../../lib/machine/Aspect";
import { atomicAspect } from "../../lib/machine/AtomicAspect";

describe("atomicAspect", () => {

    it("should ignore everything", async () => {
        const fp = createNpmDepFingerprint("foo", "0.1.0");
        const f1: Aspect = {
            extract: async () => fp,
            displayName: "foo",
            name: "foo",
        };
        const aspect = atomicAspect({
            displayName: "composite",
            name: "composite",
        }, () => false, f1);
        const fingerprinted = await aspect.consolidate([fp]);
        assert.strictEqual(fingerprinted, undefined);
    });

    it("should accept one", async () => {
        const fp = createNpmDepFingerprint("foo", "0.1.0");
        const e1: ExtractFingerprint = async () => fp;
        const f1: Aspect = {
            extract: e1,
            displayName: "foo",
            name: "foo",
        };
        const aspect = atomicAspect({
            displayName: "composite",
            name: "composite",
        }, () => true, f1);
        const fingerprinted = toArray(await aspect.consolidate([fp]));
        assert(!!fingerprinted);
        assert.strictEqual(fingerprinted[0].name, "composite:" + constructNpmDepsFingerprintName("foo"));
    });

    it("should combine two", async () => {
        const fp1 = createNpmDepFingerprint("foo", "0.1.0");
        const fp2 = createNpmDepFingerprint("bar", "0.1.0");
        const fp3 = createNpmDepFingerprint("whatever", "0.1.0");
        const e1: ExtractFingerprint = async () => [
            fp1, fp2, fp3,
        ];
        const f1: Aspect = {
            extract: e1,
            displayName: "foo",
            name: "foo",
        };
        const aspect = atomicAspect({
            displayName: "composite",
            name: "name",
        }, fp => fp.name.endsWith("foo") || fp.name.endsWith("bar"), f1);
        const fingerprinted = toArray(await aspect.consolidate([fp1, fp2, fp3]));
        assert(!!fingerprinted);
        assert.strictEqual(fingerprinted.length, 1);
        assert(fingerprinted[0].name.includes("foo"));
        assert(fingerprinted[0].name.includes("bar"));
        assert(!fingerprinted[0].name.includes("whatever"));
    });

    it("should apply two", async () => {
        const fp1 = {
            type: "foo",
            name: "foo",
            abbreviation: "npmdeps",
            version: "0.0.1",
            data: ["foo", "version"],
            sha: "",
        };
        const fp2 = {
            type: "bar",
            name: "bar",
            abbreviation: "npmdeps",
            version: "0.0.1",
            data: ["foo", "version"],
            sha: "",
        };
        const f1: Aspect = {
            extract: async () => [fp1],
            displayName: "foo",
            name: "foo",
            apply: async p1 => {
                await p1.addFile("f1", "content");
                return true;
            },
        };
        const f2: Aspect = {
            extract: async () => [fp2],
            displayName: "bar",
            name: "bar",
            apply: async p2 => {
                await p2.addFile("f2", "content");
                return true;
            },
        };

        // create Atomic Aspect
        const aspect = atomicAspect(
            {
                displayName: "composite",
                name: "composite",
            },
            fp => fp.name.endsWith("foo") || fp.name.endsWith("bar"),
            f1,
            f2);

        // create consolidated fingerprint for Atomist Aspect
        const consolidated = await aspect.consolidate([fp1, fp2]);

        // check consolidated fingerprint
        assert(!!consolidated);
        assert(consolidated.name.includes("foo"));
        assert(consolidated.name.includes("bar"));

        // apply consolidated fingerprint and ensure both apply functions run
        const p = InMemoryProject.of();
        await aspect.apply(p, consolidated);
        assert(await p.hasFile("f1"));
        assert(await p.hasFile("f2"));
    });

});
