import {isLocalProject, NodeFsLocalProject, Project, RemoteRepoRef} from "@atomist/automation-client";
import * as path from "path";
import {Descender} from "../makeVirtualProjectAware";

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
