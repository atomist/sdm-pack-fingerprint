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

import {DockerFileParser} from "../../lib/docker/DockerFileParser";
import {InMemoryProject, InMemoryProjectFile} from "@atomist/automation-client";
import stringify = require("json-stringify-safe");
import {doWithAllMatches} from "@atomist/automation-client/lib/tree/ast/astUtils";
import * as assert from "assert";

describe("Docker file parser", () => {

    it("should parse valid", async () => {
        const de = new DockerFileParser();
        const root = await de.toAst(new InMemoryProjectFile("Dockerfile", nodeDockerfile));
        console.log(stringify(root, null, 2));
    });

    it("should allow path expression and modify", async () => {
        const p = InMemoryProject.of(
            {path: "Dockerfile", content: nodeDockerfile},
        );
        await doWithAllMatches(p, new DockerFileParser(), "Dockerfile",
            "//FROM/image/tag",
            n => n.$value = "xenon");
        const contentNow = p.findFileSync("Dockerfile").getContentSync();
        assert.equal(contentNow, nodeDockerfile.replace("argon", "xenon"));
    });

});

const nodeDockerfile = `FROM node:argon
# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install
# Bundle app source
COPY . /usr/src/app
EXPOSE 8080
CMD [ "npm", "start" ]`;
