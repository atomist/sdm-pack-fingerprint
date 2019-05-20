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

import * as assert from "assert";
import {
    constructNpmDepsFingerprintName,
    deconstructNpmDepsFingerprintName,
} from "../../lib/fingerprints/npmDeps";

describe("npmDeps", () => {
    it("constructs and deconstructs a fingerprint name", () => {
        const original = "@atomist/sdm";

        const fingerprintName = constructNpmDepsFingerprintName(original);

        const result = deconstructNpmDepsFingerprintName(fingerprintName);

        assert.strictEqual(result, original);
    });

    it("constructs and deconstructs a fingerprint name", () => {
        const original = "lodash";

        const fingerprintName = constructNpmDepsFingerprintName(original);

        const result = deconstructNpmDepsFingerprintName(fingerprintName);

        assert.strictEqual(result, original);
    });

    it("returns undefined for an unknown fingerprint name", () => {
        const result = deconstructNpmDepsFingerprintName("another-fingerprint::and::stuff");

        assert.strictEqual(result, undefined);
    });

    it("doesn't freak out on undefined", () => {
        const result = deconstructNpmDepsFingerprintName(undefined);

        assert.strictEqual(result, undefined);
    });

    it("doesn't freak out on empty string", () => {
        const result = deconstructNpmDepsFingerprintName("");

        assert.strictEqual(result, undefined);
    });
});
