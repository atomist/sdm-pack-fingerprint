/*
 * Copyright © 2018 Atomist, Inc.
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
import assert = require("power-assert");
import {
    applyDockerBaseFingerprint,
    dockerBaseFingerprint,
} from "../../lib/fingerprints/dockerFrom";

// Note this dockerfile wouldn't actually work - its just for test purposes
const dummyDockerFile = `
FROM openjdk:8-alpine
MAINTAINER Atomist <docker@atomist.com>
RUN mkdir -p /opt/app
WORKDIR /opt/app
EXPOSE 8080
CMD ["-jar", "uuu001.jar"]
ENTRYPOINT ["/usr/local/bin/dumb-init"]
COPY target/dummy.jar dummy.jar
`;

const updateMeDockerfile = `
FROM openjdk:7-alpine
MAINTAINER Atomist <docker@atomist.com>
RUN mkdir -p /opt/app
WORKDIR /opt/app
EXPOSE 8080
CMD ["-jar", "uuu001.jar"]
ENTRYPOINT ["/usr/local/bin/dumb-init"]
COPY target/dummy.jar dummy.jar
`;

const expectedResult = {
    name: "docker-base-image-openjdk",
    abbreviation: "dbi-openjdk",
    version: "0.0.1",
    data: { image: "openjdk", version: "8-alpine"},
    sha: "040ce6b4cd756db6cd2eb52b81af58b746c00a883bfe784b317fd4ea3fff415e",
    value: { image: "openjdk", version: "8-alpine"},
};

describe("dockerBaseFingerprint", () => {
    describe("extract valid fingerprint", () => {
        it("should extract valid fingerprint", async () => {
            const p = InMemoryProject.from({
                repo: "foo",
                sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
                branch: "master",
                owner: "foo",
                url: "https://fake.com/foo/foo.git",
            }, ({ path: "Dockerfile", content: dummyDockerFile })) as any;

            const result = await dockerBaseFingerprint(p);
            assert.deepEqual(result, expectedResult);
        });
    });

    describe("empty dockerfile, invalid fingerprint", async () => {
        it("should return undefined", async () => {
            const p = InMemoryProject.from({
                repo: "foo",
                sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
                branch: "master",
                owner: "foo",
                url: "https://fake.com/foo/foo.git",
            }, ({ path: "Dockerfile", content: "" })) as any;

            const result = await dockerBaseFingerprint(p);
            assert.strictEqual(result, undefined);
        });
    });
});

describe("applyDockerBaseFingerprint", async () => {
    it("should successfully update the base image", async () => {
        const p = InMemoryProject.from({
            repo: "foo",
            sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
            branch: "master",
            owner: "foo",
            url: "https://fake.com/foo/foo.git",
        }, ({ path: "Dockerfile", content: updateMeDockerfile })) as any;

        const result = await applyDockerBaseFingerprint(p, expectedResult);
        assert.strictEqual(result, true);
    });

    it("should have updated the dockerfile content", async () => {
        const p = InMemoryProject.from({
            repo: "foo",
            sha: "26e18ee3e30c0df0f0f2ff0bc42a4bd08a7024b9",
            branch: "master",
            owner: "foo",
            url: "https://fake.com/foo/foo.git",
        }, ({ path: "Dockerfile", content: updateMeDockerfile })) as any;
        const t = (p as InMemoryProject);

        await applyDockerBaseFingerprint(p, expectedResult);
        const updatedDockerFileHandle = await t.getFile("Dockerfile");
        const updatedDockerfile = await updatedDockerFileHandle.getContent();

        assert.strictEqual(updatedDockerfile, dummyDockerFile);
    });
});
