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

import { fingerprintOf } from "../../lib/adhoc/construct";

import * as assert from "assert";

describe("fingerprintOf", () => {

    it("should default to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}});
        assert.strictEqual(fp.path, undefined);
    });

    it("should default . to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: "."});
        assert.strictEqual(fp.path, undefined);
    });

    it("should default empty string to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: ""});
        assert.strictEqual(fp.path, undefined);
    });

    it("should take custom path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: "thing2"});
        assert.strictEqual(fp.path, "thing2");
    });

});
