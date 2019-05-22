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

import { toArray } from "@atomist/sdm-core/lib/util/misc/array";
import * as assert from "assert";
import {
    constructNpmDepsFingerprintName,
    getNpmDepFingerprint,
} from "../../lib/fingerprints/npmDeps";
import { derivedFeature } from "../../lib/machine/derivedFeature";
import {
    ExtractFingerprint,
    Feature,
} from "../../lib/machine/fingerprintSupport";

describe("derivedFeature", () => {

    it("should ignore everything", async () => {
        const fp = getNpmDepFingerprint("foo", "0.1.0");
        const f1: Feature = {
            selector: () => true,
            extract: async () => fp,
            displayName: "foo",
        };
        const feature = derivedFeature({
            displayName: "composite",
        }, () => false, f1);
        const fingerprinted = await feature.derive([fp]);
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
        const feature = derivedFeature({
            displayName: "composite",
        }, () => true, f1);
        const fingerprinted = toArray(await feature.derive([fp]));
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
        const feature = derivedFeature({
            displayName: "composite",
        }, fp => fp.name.endsWith("foo") || fp.name.endsWith("bar"), f1);
        const fingerprinted = toArray(await feature.derive([fp1, fp2, fp3]));
        assert(!!fingerprinted);
        assert.strictEqual(fingerprinted.length, 1);
        assert(fingerprinted[0].name.includes("foo"));
        assert(fingerprinted[0].name.includes("bar"));
        assert(!fingerprinted[0].name.includes("whatever"));
    });

});
