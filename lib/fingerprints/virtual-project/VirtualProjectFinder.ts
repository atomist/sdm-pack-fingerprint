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

/**
 * Virtual project status of a repository
 */
export enum VirtualProjectStatus {

    /**
     * This is definitely not a project with virtual subprojects. We only care about the root.
     */
    RootOnly = "RootOnly",

    /**
     * This is definitely a project with virtual subprojects whose path we've identified
     */
    IdentifiedPaths = "IdentifiedPaths",

    /**
     * The virtual project status of this repo cannot be determined
     */
    Unknown = "Unknown",
}

/**
 * Virtual project we've found in a project
 */
export interface VirtualProject {

    /**
     * Path within the root
     */
    path: string;

    /**
     * Reason for determining that this is a subproject
     */
    reason: string;
}

export interface VirtualProjectsInfo {
    readonly status: VirtualProjectStatus.IdentifiedPaths;
    readonly virtualProjects: VirtualProject[];
}

export interface NoVirtualProjectsInfo {
    readonly status: VirtualProjectStatus.RootOnly | VirtualProjectStatus.Unknown;
}

/**
 * Constant for a project with no virtual projects:
 * Only the root matters.
 * @type {{status: VirtualProjectStatus.RootOnly}}
 */
export const RootIsOnlyProject: NoVirtualProjectsInfo = {
    status: VirtualProjectStatus.RootOnly,
};

export type VirtualProjectInfo = VirtualProjectsInfo | NoVirtualProjectsInfo;

/**
 * Did we find multiple virtual projects?
 */
export function isVirtualProjectsInfo(vpi: VirtualProjectInfo): vpi is VirtualProjectsInfo {
    return vpi.status === VirtualProjectStatus.IdentifiedPaths;
}

/**
 * Extended by types that can identify virtual projects under a base project
 */
export interface VirtualProjectFinder {

    readonly name: string;

    /**
     * Determine virtual project information for this project
     * @param {Project} project
     * @return {Promise<VirtualProjectInfo>}
     */
    findVirtualProjectInfo: (project: Project) => Promise<VirtualProjectInfo>;
}
