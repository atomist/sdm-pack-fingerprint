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
    createNpmDepsFingerprints,
    deconstructNpmDepsFingerprintName,
} from "../../lib/fingerprints/npmDeps";
import { InMemoryProject } from "@atomist/automation-client";

const dummyPackageJson = `
{
    "devDependencies": {
        "@atomist/sdm-pack": "1.2.3"
    }
}
`;

const dummyPackageJson1 = `
{
    "dependencies": {
        "@atomist/sdm-pack": "1.2.3"
    }
}
`;

const dummyPackageJson2 = `
{
    "dependencies": {
        "@atomist/sdm-pack": "1.2.3"
    },
    "devDependencies": {
        "@atomist/sdm-pack1": "1.2.3"
    }
}
`;

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

    // it("returns undefined for an unknown fingerprint name", () => {
    //     const result = deconstructNpmDepsFingerprintName("another-fingerprint::and::stuff");

    //     assert.strictEqual(result, undefined);
    // });

    // it("doesn't freak out on undefined", () => {
    //     const result = deconstructNpmDepsFingerprintName(undefined);

    //     assert.strictEqual(result, undefined);
    // });

    it("doesn't freak out on empty string", () => {
        const result = deconstructNpmDepsFingerprintName("");

        assert.strictEqual(result, undefined);
    });

    it("finds dependencies", async () => {
        const p = InMemoryProject.from({
            repo: "foo",
            sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
            branch: "master",
            owner: "foo",
            url: "https://fake.com/foo/foo.git",
        }, ({ path: "package.json", content: dummyPackageJson1 })) as any;

        const fp = await createNpmDepsFingerprints(p);

        assert.deepEqual(fp, [{
            abbreviation: "npmdeps",
            data: ["@atomist/sdm-pack", "1.2.3"],
            name: "atomist::sdm-pack",
            sha: "85e02c7662db6dc9907944b58a6f18f380f6b96fc29358ce4a99c0826534a273",
            type: "npm-project-deps",
            version: "0.0.1",
        }]);
    })

    it("finds dev dependencies", async () => {
        const p = InMemoryProject.from({
            repo: "foo",
            sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
            branch: "master",
            owner: "foo",
            url: "https://fake.com/foo/foo.git",
        }, ({ path: "package.json", content: dummyPackageJson })) as any;

        const fp = await createNpmDepsFingerprints(p);

        assert.deepEqual(fp, [{
            abbreviation: "npmdeps",
            data: ["@atomist/sdm-pack", "1.2.3"],
            name: "atomist::sdm-pack",
            sha: "85e02c7662db6dc9907944b58a6f18f380f6b96fc29358ce4a99c0826534a273",
            type: "npm-project-deps",
            version: "0.0.1",
        }]);
    })

    it("finds a combo of both", async () => {
        const p = InMemoryProject.from({
            repo: "foo",
            sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
            branch: "master",
            owner: "foo",
            url: "https://fake.com/foo/foo.git",
        }, ({ path: "package.json", content: dummyPackageJson2 })) as any;

        const fp = await createNpmDepsFingerprints(p);

        assert.deepEqual(fp, [{
            abbreviation: "npmdeps",
            data: ["@atomist/sdm-pack", "1.2.3"],
            name: "atomist::sdm-pack",
            sha: "85e02c7662db6dc9907944b58a6f18f380f6b96fc29358ce4a99c0826534a273",
            type: "npm-project-deps",
            version: "0.0.1",
        },
        {
            abbreviation: "npmdeps",
            data: ["@atomist/sdm-pack1", "1.2.3"],
            name: "atomist::sdm-pack1",
            sha: "e64b18f7eafd583d600974d648d43fa12fcd974293a681031e8ab4cbff2d67c2",
            type: "npm-project-deps",
            version: "0.0.1",
        }]);
    })

});
