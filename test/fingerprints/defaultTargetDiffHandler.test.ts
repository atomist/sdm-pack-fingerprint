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

import { SdmContext } from "@atomist/sdm";
import * as assert from "assert";
import { Aspect } from "../../lib/machine/Aspect";
import { DefaultTargetDiffHandler } from "../../lib/machine/fingerprintSupport";

describe("DefaultTargetDiffHandler", () => {
    it("we always abstain if there is no previous FP", () => {
        // tslint:disable-next-line:no-object-literal-type-assertion
        const ctx = {} as SdmContext;
        const diffs = [{
            targets: {},
            to: {
                type: "type",
                name: "name",
                sha: "sha",
                data: "somedata",
            },
            data: { from: ["blah"], to: ["blah"] },
            owner: "blah",
            repo: "blah",
            sha: "sha",
            providerId: "pid",
            channel: "blah",
            branch: "master",
        }] as any;
        // tslint:disable-next-line:no-object-literal-type-assertion
        const aspect = {} as Aspect;
        return DefaultTargetDiffHandler(ctx, diffs, aspect).then(votes =>
            votes.forEach(vote => assert.deepStrictEqual(vote, { abstain: true })));
    });
});
