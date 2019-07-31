import {LocalProject, NodeFsLocalProject, RepoRef} from "@atomist/automation-client";
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
