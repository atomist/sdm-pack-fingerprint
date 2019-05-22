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

import {InMemoryProject} from "@atomist/automation-client";
import {toArray} from "@atomist/sdm-core/lib/util/misc/array";
import * as assert from "assert";
import {
    constructNpmDepsFingerprintName,
    getNpmDepFingerprint,
} from "../../lib/fingerprints/npmDeps";
import {atomicFeature} from "../../lib/machine/AtomicFeature";
import {
    ExtractFingerprint,
    Feature,
} from "../../lib/machine/fingerprintSupport";

describe("atomicFeature", () => {

    it("should ignore everything", async () => {
        const fp = getNpmDepFingerprint("foo", "0.1.0");
        const f1: Feature = {
            selector: () => true,
            extract: async () => fp,
            displayName: "foo",
        };
        const feature = atomicFeature({
            displayName: "composite",
        }, () => false, f1);
        const fingerprinted = await feature.consolidate([fp]);
        assert.strictEqual(fingerprinted, undefined);
    });

    it("should accept one", async () => {
        const fp = getNpmDepFingerprint("foo", "0.1.0");
        const e1: ExtractFingerprint = async () => fp;
        const f1: Feature = {
            selector: () => true,
            extract: e1,
            displayName: "foo",
        };
        const feature = atomicFeature({
            displayName: "composite",
        }, () => true, f1);
        const fingerprinted = toArray(await feature.consolidate([fp]));
        assert(!!fingerprinted);
        assert.strictEqual(fingerprinted[0].name, "composite:" + constructNpmDepsFingerprintName("foo"));
    });

    it("should combine two", async () => {
        const fp1 = getNpmDepFingerprint("foo", "0.1.0");
        const fp2 = getNpmDepFingerprint("bar", "0.1.0");
        const fp3 = getNpmDepFingerprint("whatever", "0.1.0");
        const e1: ExtractFingerprint = async () => [
            fp1, fp2, fp3,
        ];
        const f1: Feature = {
            selector: () => true,
            extract: e1,
            displayName: "foo",
        };
        const feature = atomicFeature({
            displayName: "composite",
        }, fp => fp.name.endsWith("foo") || fp.name.endsWith("bar"), f1);
        const fingerprinted = toArray(await feature.consolidate([fp1, fp2, fp3]));
        assert(!!fingerprinted);
        assert.strictEqual(fingerprinted.length, 1);
        assert(fingerprinted[0].name.includes("foo"));
        assert(fingerprinted[0].name.includes("bar"));
        assert(!fingerprinted[0].name.includes("whatever"));
    });

    it("should apply two", async () => {
        const fp1 = getNpmDepFingerprint("foo", "0.1.0");
        const fp2 = getNpmDepFingerprint("bar", "0.1.0");
        const e1: ExtractFingerprint = async () => [
            fp1,
        ];
        const e2: ExtractFingerprint = async () => [
            fp2,
        ];
        const f1: Feature = {
            selector: fp => fp.name.endsWith("foo"),
            extract: e1,
            displayName: "foo1",
            apply: async p1 => {
                await p1.addFile("f1", "content");
                return true;
            },
        };
        const f2: Feature = {
            selector: fp => fp.name.endsWith("bar"),
            extract: e2,
            displayName: "bar",
            apply: async p2 => {
                await p2.addFile("f2", "content");
                return true;
            },
        };
        const feature = atomicFeature({
                displayName: "composite",
            }, fp => fp.name.endsWith("foo") || fp.name.endsWith("bar"),
            f1, f2);
        const consolidated = await feature.consolidate([fp1, fp2]);
        assert(!!consolidated);
        assert(consolidated.name.includes("foo"));
        assert(consolidated.name.includes("bar"));
        const p = InMemoryProject.of();
        await feature.apply(p, consolidated);
        assert(await p.hasFile("f1"));
        assert(await p.hasFile("f2"));
    });

});
