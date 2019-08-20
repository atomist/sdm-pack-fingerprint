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
import {sha256} from "@atomist/clj-editors";
import * as assert from "assert";
import {Aspect} from "../../lib/machine/Aspect";
import {computeFingerprints} from "../../lib/machine/runner";

function alwaysFindAspect(name: string): Aspect {
    return {
        name,
        displayName: "thing",
        extract:
            async p => {
                const data = {thing: "thing"};
                return {
                    name,
                    type: "thing",
                    sha: sha256(JSON.stringify(data)),
                    data,
                };
            },
    };
}

describe("computer", () => {

    it("should compute none", async () => {
        const fps = await computeFingerprints([], InMemoryProject.of());
        assert.strictEqual(fps.length, 0);
    });

    it("should compute one", async () => {
        const fps = await computeFingerprints([alwaysFindAspect("thing")], InMemoryProject.of());
        assert.strictEqual(fps.length, 1);
        assert.strictEqual(fps[0].name, "thing");
    });

    it("should compute two", async () => {
        const fps = await computeFingerprints([
                alwaysFindAspect("foo"), alwaysFindAspect("bar")],
            InMemoryProject.of());
        assert.strictEqual(fps.length, 2);
    });

    it("should consolidate", async () => {
        const consolidater: Aspect = {
            displayName: "consolidated",
            name: "consolidated",
            extract: async () => [],
            consolidate: async what => {
                const data: Record<string, boolean> = {};
                for (const fp of what) {
                    data[fp.name] = true;
                }
                return {
                    name: "consolidated",
                    type: "x",
                    data,
                    sha: sha256(JSON.stringify(data)),
                };
            },
        };
        const fps = await computeFingerprints([
                alwaysFindAspect("foo"), alwaysFindAspect("bar"),
                consolidater],
            InMemoryProject.of());
        assert.strictEqual(fps.length, 3);
        const found = fps.find(fp => fp.name === "consolidated");
        assert(!!found);
        assert.strictEqual(found.name, "consolidated");
        assert.strictEqual(found.data.foo, true);
        assert.strictEqual(found.data.foo, true);
    });

});
