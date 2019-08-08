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
import { Descender } from "../makeVirtualProjectAware";

export const localProjectUnder: Descender = async (p: Project, pathWithin: string) => {
    if (!isLocalProject(p)) {
        throw new Error("Only local projects are supported");
    }
    const rid = p.id as RemoteRepoRef;
    const newId: RemoteRepoRef = {
        ...rid,
        path: pathWithin,
    };
    const virtualProject = await NodeFsLocalProject.fromExistingDirectory(
        newId,
        path.join(p.baseDir, pathWithin),
        async () => {
        },
    );
    return virtualProject;
};
