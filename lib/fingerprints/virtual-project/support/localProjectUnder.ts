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
    isLocalProject,
    NodeFsLocalProject,
    Project,
    RemoteRepoRef,
} from "@atomist/automation-client";
import * as path from "path";

/**
 * Return a virtual project with the given directory as root.
 * Updateable, with changes affecting the original project.
 * Inexpensive to invoke as the project created is a lightweight reference to the
 * same content on disk.
 * @param {Project} rootProject original project. Must be a LocalProject.
 * @param {string} pathUnder path under the root to be the based directory
 * of the new project
 * @return {Promise<Project>}
 */
export async function localProjectUnder(rootProject: Project, pathUnder: string): Promise<Project> {
    if (!isLocalProject(rootProject)) {
        throw new Error("Only local projects are supported");
    }
    const rid = rootProject.id as RemoteRepoRef;
    const newId: RemoteRepoRef = {
        ...rid,
        path: pathUnder,
    };
    return NodeFsLocalProject.fromExistingDirectory(
        newId,
        path.join(rootProject.baseDir, pathUnder),
        async () => {
        },
    );
}
