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

import {
    fileIterator,
    gatherFromFiles,
} from "@atomist/automation-client/lib/project/util/projectUtils";
import * as path from "path";
import {
    RootIsOnlyProject,
    VirtualProjectFinder,
    VirtualProjectStatus,
} from "./VirtualProjectFinder";

/**
 * Return a VirtualProjectFinder that infers subprojects from filenames that may be
 * anywhere. E.g. every directory that contains a Maven pom.xml might be
 * considered a subproject.
 * If any of these files exists in the root, don't look further.
 */
export function fileNamesVirtualProjectFinder(...filenames: string[]): VirtualProjectFinder {
    return {
        name: "fileNames: " + filenames.join(","),
        findVirtualProjectInfo: async p => {
            // First check if any file exists in root
            // noinspection LoopStatementThatDoesntLoopJS
            for await (const _ of fileIterator(p, filenames)) {
                return RootIsOnlyProject;
            }
            const virtualProjects = await gatherFromFiles(p,
                filenames.map(f => "**/" + f),
                async f => {
                    return {
                        path: path.dirname(f.path),
                        reason: "has file: " + f.name,
                    };
                });
            if (virtualProjects.length > 0) {
                return {
                    status: VirtualProjectStatus.IdentifiedPaths,
                    virtualProjects,
                };
            }
            return {
                status: VirtualProjectStatus.Unknown,
            };
        },
    };
}
