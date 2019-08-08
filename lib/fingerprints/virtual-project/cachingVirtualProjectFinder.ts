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

import { Project } from "@atomist/automation-client";
import {
    VirtualProjectFinder,
    VirtualProjectInfo,
} from "./VirtualProjectFinder";

type DecoratedProject = Project & { virtualProjectInfo?: VirtualProjectInfo };

/**
 * Make this VirtualProjectFinder efficient for subsequent invocation
 * @param {VirtualProjectFinder} virtualProjectFinder
 * @return {VirtualProjectFinder}
 */
export function cachingVirtualProjectFinder(virtualProjectFinder: VirtualProjectFinder): VirtualProjectFinder {
    return {
        name: virtualProjectFinder.name,
        findVirtualProjectInfo: async p => {
            const dp = p as DecoratedProject;
            if (!dp.virtualProjectInfo) {
                dp.virtualProjectInfo = await virtualProjectFinder.findVirtualProjectInfo(p);
            }
            return dp.virtualProjectInfo;
        },
    };
}
