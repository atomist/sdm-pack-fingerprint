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
    LocalProject,
    NodeFsLocalProject,
    RepoRef,
} from "@atomist/automation-client";
import * as tmp from "tmp-promise";

tmp.setGracefulCleanup();

/**
 * Create a temporary project on local disk
 * @param {{path: string; content: string}} files
 * @return {Promise<LocalProject>}
 */
export async function tempProject(...files: Array<{ path: string, content: string }>): Promise<LocalProject> {
    const id: RepoRef = {
        owner: "owner",
        repo: "repo",
        url: undefined,
    };
    const dir = tmp.dirSync({unsafeCleanup: true});
    const p = new NodeFsLocalProject(id, dir.name,
        async () => dir.removeCallback());
    for (const f of files) {
        await p.addFile(f.path, f.content);
    }
    return p;
}
