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
import * as assert from "assert";
import {makeVirtualProjectAware} from "../../lib/fingerprints/virtual-project/makeVirtualProjectAware";
import {
    RootIsOnlyProject,
    VirtualProjectFinder,
} from "../../lib/fingerprints/virtual-project/VirtualProjectFinder";
import {Aspect, isFurtherAnalysisVetoFingerprint} from "../../lib/machine/Aspect";
import {createFingerprintComputer} from "../../lib/machine/runner";
import {sha256} from "../../lib/support/hash";
import {fingerprintOf} from "../../lib/adhoc/construct";

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
        const fps = await createFingerprintComputer([])(InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 0);
    });

    it("should compute one", async () => {
        const fps = await createFingerprintComputer([alwaysFindAspect("thing")])(InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 1);
        assert.strictEqual(fps[0].name, "thing");
    });

    it("should compute two", async () => {
        const fps = await createFingerprintComputer([
            alwaysFindAspect("foo"), alwaysFindAspect("bar")])(
            InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 2);
        assert(!fps.some(isFurtherAnalysisVetoFingerprint));
    });

    it("should not veto", async () => {
        const neverVetoVetoAspect: Aspect = {
            name: "x", displayName: "x",
            extract: async () => fingerprintOf({type: "x", data: {who: "cares"}}),
            vetoWhen: () => false,
        };
        const fps = await createFingerprintComputer([
            neverVetoVetoAspect,
            alwaysFindAspect("foo"), alwaysFindAspect("bar")])(
            InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 3);
        assert(!fps.some(isFurtherAnalysisVetoFingerprint));
    });

    it("should not compute two because first vetoed", async () => {
        const vetoAspect: Aspect = {
            name: "x", displayName: "x",
            extract: async () => fingerprintOf({type: "x", data: {who: "cares"}}),
            vetoWhen: fingerprints => fingerprints.some(fp => fp.type === "x") ? {reason: "i hate y'all"} : false,
        };
        const fps = await createFingerprintComputer([
            vetoAspect,
            alwaysFindAspect("bar")])(
            InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 2);
        assert.strictEqual(fps[0].type, "x", "Should get original fingerprint");
        assert(isFurtherAnalysisVetoFingerprint(fps[1]));
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
        const fps = await createFingerprintComputer(
            [alwaysFindAspect("foo"), alwaysFindAspect("bar"),
                consolidater])(
            InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 3);
        const found = fps.find(fp => fp.name === "consolidated");
        assert(!!found);
        assert.strictEqual(found.name, "consolidated");
        assert.strictEqual(found.data.foo, true);
        assert.strictEqual(found.data.foo, true);
    });

    it("should call VirtualProjectFinder", async () => {
        let count = 0;
        const fakeVpf: VirtualProjectFinder = {
            name: "fake",
            findVirtualProjectInfo: async () => {
                ++count;
                return RootIsOnlyProject;
            },
        };
        const fps = await createFingerprintComputer([
                alwaysFindAspect("foo"),
                alwaysFindAspect("bar"),
            ].map(a => makeVirtualProjectAware(a, fakeVpf)),
            fakeVpf)(
            InMemoryProject.of(), {} as any);
        assert.strictEqual(fps.length, 2);
        assert.strictEqual(count, 3, "Should have called virtual project finder 3x");
    });

});
