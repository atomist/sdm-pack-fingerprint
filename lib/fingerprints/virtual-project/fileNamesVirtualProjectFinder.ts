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
    logger, ProjectFile, Project,
    projectUtils,
} from "@atomist/automation-client";

import * as _ from "lodash";
import * as pathlib from "path";
import {
    RootIsOnlyProject,
    VirtualProjectFinder,
    VirtualProjectStatus,
} from "./VirtualProjectFinder";

export interface VirtualPathStatus {

    /** Include this path? */
    readonly include: boolean;

    /** Keep looking under this path? */
    readonly keepLooking: boolean;
}

export interface GlobRule {

    readonly glob: string;

    /**
     * Test that should be satisfied against this file to indicate how it should be handled
     * @param {string} content
     * @return {Promise<boolean>}
     */
    status: (f: ProjectFile) => Promise<VirtualPathStatus>;
}

export type Globbable = string | GlobRule;

function isGlobRule(a: string | GlobRule): a is GlobRule {
    const maybe = a as GlobRule;
    return !!maybe.glob && !!maybe.status;
}

/**
 * Identify directories in which any file matching any glob pattern is found as virtual projects.
 * If they are found in the root, just return it
 * @param {string} globs
 * @return {VirtualProjectFinder}
 */
export function globsVirtualProjectFinder(...globs: Globbable[]): VirtualProjectFinder {
    const globRules = globs.map(toGlobRule);
    return {
        name: `file glob [${globRules.map(gr => gr.glob)}]`,
        findVirtualProjectInfo: async p => {
            const virtualPaths = _.uniq(
                _.flatten(await Promise.all(globRules.map(gr => virtualPathsFrom(p, gr)))),
            )
                .filter(vp => vp.status.include);
            logger.debug(`Virtual paths for '${globs}' were ${JSON.stringify(virtualPaths)}`);

            if (virtualPaths.length === 0) {
                return {
                    status: VirtualProjectStatus.Unknown,
                };
            }
            if (virtualPaths.some(vp => vp.dir === "." && !vp.status.keepLooking)) {
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

async function virtualPathsFrom(p: Project, gr: GlobRule): Promise<Array<{ dir: string, name: string, status: VirtualPathStatus }>> {
    return (await projectUtils.gatherFromFiles(p,
        gr.glob,
        async f => ({file: f, status: await gr.status(f)})))
        .map(f => {
            return {
                dir: pathlib.dirname(f.file.path),
                name: f.file.name,
                status: f.status,
            };
        });
}

function toGlobRule(glob: Globbable): GlobRule {
    return isGlobRule(glob) ? glob : {glob, status: async () => ({include: true, keepLooking: false})};
}

/**
 * Return a VirtualProjectFinder that infers virtual projects from filenames (NOT paths) that may be
 * anywhere. E.g. every directory that contains a Maven pom.xml might be
 * considered a subproject.
 * If any of these files exists in the root, don't look further.
 */
export function fileNamesVirtualProjectFinder(...filenames: Array<string | GlobRule>): VirtualProjectFinder {
    const rules = filenames.map(toGlobRule);
    return globsVirtualProjectFinder(...rules.map(r => ({glob: `**/${r.glob}`, status: r.status})));
}
