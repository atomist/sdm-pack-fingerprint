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

import { LocalProject } from "@atomist/automation-client";
import {
    applyFingerprint,
    mavenCoordinates,
    mavenDeps,
    renderProjectLibDiff,
} from "@atomist/clj-editors";
import { Feature } from "../machine/Feature";

export const MavenDeps: Feature = {
    displayName: "Maven dependencies",
    name: "maven-project-deps",
    extract: p => mavenDeps((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => {
        return fp.name.startsWith(MavenDeps.name);
    },
    toDisplayableFingerprint: fp => fp.name,
    summary: renderProjectLibDiff,
};

export const MavenCoordinates: Feature = {
    displayName: "Maven dependencies",
    name: "maven-project-coordinates",
    extract: p => mavenCoordinates((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => {
        return fp.name.startsWith(MavenCoordinates.name);
    },
    toDisplayableFingerprint: fp => fp.name,
    summary: (diff, target) => {
        return {
            title: "Maven Coordinates have Updated",
            description: `from ${diff.from.data} to ${diff.to.data}`,
        };
    },
};
