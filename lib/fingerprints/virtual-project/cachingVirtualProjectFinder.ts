import {Project} from "@atomist/automation-client";
import {VirtualProjectFinder, VirtualProjectInfo} from "./VirtualProjectFinder";

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
