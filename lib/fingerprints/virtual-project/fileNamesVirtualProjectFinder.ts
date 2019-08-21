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
    logger,
    projectUtils,
} from "@atomist/automation-client";

import * as _ from "lodash";
import * as pathlib from "path";
import {
    RootIsOnlyProject,
    VirtualProjectFinder,
    VirtualProjectStatus,
} from "./VirtualProjectFinder";

/**
 * Identify directories in which any file matching any glob pattern is found as virtual projects.
 * If they are found in the root, just return it
 * @param {string} globs
 * @return {VirtualProjectFinder}
 */
export function globsVirtualProjectFinder(...globs: string[]): VirtualProjectFinder {
    return {
        name: `file glob [${globs}]`,
        findVirtualProjectInfo: async p => {
            const virtualPaths = _.uniq((await projectUtils.gatherFromFiles(p, globs, async f => f))
                .map(f => ({
                    dir: pathlib.dirname(f.path),
                    name: f.name,
                })));
            logger.debug(`Virtual paths for '${globs}' were ${JSON.stringify(virtualPaths)}`);

            if (virtualPaths.length === 0) {
                return {
                    status: VirtualProjectStatus.Unknown,
                };
            }
            if (virtualPaths.some(vp => vp.dir === ".")) {
                return RootIsOnlyProject;
            }
            return {
                status: VirtualProjectStatus.IdentifiedPaths,
                virtualProjects: virtualPaths.map(vp => ({
                    path: vp.dir,
                    reason: `has file: ${vp.name}`,
                })),
            };
        },
    };
}

/**
 * Return a VirtualProjectFinder that infers virtual projects from filenames (NOT paths) that may be
 * anywhere. E.g. every directory that contains a Maven pom.xml might be
 * considered a subproject.
 * If any of these files exists in the root, don't look further.
 */
export function fileNamesVirtualProjectFinder(...filenames: string[]): VirtualProjectFinder {
    return globsVirtualProjectFinder(...filenames.map(n => `**/${n}`));
}
