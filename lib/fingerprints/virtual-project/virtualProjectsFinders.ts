import {isVirtualProjectsInfo, VirtualProject, VirtualProjectFinder, VirtualProjectStatus} from "./VirtualProjectFinder";

/**
 * Return a subproject finder of all these
 * @param {VirtualProjectFinder} finders
 * @return {VirtualProjectFinder}
 */
export function firstVirtualProjectFinderOf(...finders: VirtualProjectFinder[]): VirtualProjectFinder {
    return {
        name: "Composite subproject finder",
        findVirtualProjectInfo: async p => {
            const virtualProjects: VirtualProject[] = [];
            for (const finder of finders) {
                const r = await finder.findVirtualProjectInfo(p);
                if (!isVirtualProjectsInfo(r)) {
                    return r;
                }
                virtualProjects.push(...r.virtualProjects);
            }
            return {
                status: VirtualProjectStatus.IdentifiedPaths,
                virtualProjects,
            };
        },
    };
}

// TODO any of would parallelize
