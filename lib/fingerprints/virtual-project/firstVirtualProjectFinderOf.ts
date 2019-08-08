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

import { logger } from "@atomist/automation-client";
import {
    isVirtualProjectsInfo,
    RootIsOnlyProject,
    VirtualProject,
    VirtualProjectFinder,
    VirtualProjectStatus,
} from "./VirtualProjectFinder";

/**
 * Return the first virtual project finder of the arguments
 * that matches. Evaluation is serial but can be short circuited.
 * @param {VirtualProjectFinder} finders
 * @return {VirtualProjectFinder}
 */
export function firstVirtualProjectFinderOf(...finders: VirtualProjectFinder[]): VirtualProjectFinder {
    return {
        name: finders.map(f => `(${f.name})`).join(" then "),
        findVirtualProjectInfo: async p => {
            const virtualProjects: VirtualProject[] = [];
            for (const finder of finders) {
                const vpi = await finder.findVirtualProjectInfo(p);
                logger.debug(`Finder ${finder.name} returned ${JSON.stringify(vpi)}`);

                if (vpi.status === VirtualProjectStatus.RootOnly) {
                    // We have definitely determined it's root only and don't need to keep looking
                    return RootIsOnlyProject;
                }
                if (isVirtualProjectsInfo(vpi)) {
                    virtualProjects.push(...vpi.virtualProjects);
                }
                // If we get here, this finder returned Unknown status. Keep going...
            }
            return virtualProjects.length > 0 ?
                {
                    status: VirtualProjectStatus.IdentifiedPaths,
                    virtualProjects,
                } :
                {
                    status: VirtualProjectStatus.Unknown,
                };
        },
    };
}
