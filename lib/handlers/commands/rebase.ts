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
    editModes,
    GitProject,
    logger,
} from "@atomist/automation-client";
import {
    CodeTransform,
    execPromise,
    TransformPresentation,
} from "@atomist/sdm";

export interface RebaseOptions {
    rebase: boolean;
    rebaseStrategy: RebaseStrategy;
    onRebaseFailure: RebaseFailure;
}

export enum RebaseStrategy {
    Ours = "ours",
    Theirs = "theirs",
}

export enum RebaseFailure {
    Fail = "fail",
    DeleteBranch = "deleteBranch",
}

export const DefaultRebaseOptions: RebaseOptions = {
    rebase: false,
    rebaseStrategy: RebaseStrategy.Ours,
    onRebaseFailure: RebaseFailure.Fail,
};

/**
 * CodeTransform that can be used in a chain of transforms to update the target branch
 * from the base branch before applying the actual transforms
 */
export function rebaseCodeTransform(transformPresentation: TransformPresentation<any>,
                                    options: RebaseOptions): CodeTransform {
    return async (p, papi) => {
        const lp = p as GitProject;
        const tp = transformPresentation(papi, p);
        if (editModes.isPullRequest(tp) && !!options.rebase) {

            try {
                await execPromise(
                    "git", ["fetch", "--unshallow"],
                    {
                        cwd: lp.baseDir,
                    });
            } catch (e) {
                logger.warn("'git fetch --unshallow' failed: %s", e.message);
            }

            try {
                await execPromise(
                    "git", ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
                    {
                        cwd: lp.baseDir,
                    });
                await execPromise(
                    "git", ["fetch", "origin"],
                    {
                        cwd: lp.baseDir,
                    });
            } catch (e) {
                logger.warn("'git fetch origin' failed: %s", e.message);
            }

            const commandResult = await execPromise(
                "git", ["branch", "--list", "-r", `origin/${tp.branch}`],
                {
                    cwd: lp.baseDir,
                });

            if (commandResult.stdout.includes(`origin/${tp.branch}`)) {
                await lp.checkout(tp.branch);
                try {
                    await execPromise(
                        "git", ["rebase", "-X", options.rebaseStrategy, tp.targetBranch || "master"],
                        {
                            cwd: lp.baseDir,
                        });
                    await lp.push({ force: true });
                } catch (e) {
                    if (options.onRebaseFailure === RebaseFailure.DeleteBranch) {
                        try {
                            await lp.checkout(tp.targetBranch);
                            await execPromise(
                                "git", ["branch", "-D", tp.branch],
                                {
                                    cwd: lp.baseDir,
                                });
                            await execPromise(
                                "git", ["push", "origin", "--delete", tp.branch],
                                {
                                    cwd: lp.baseDir,
                                });
                        } catch (er) {
                            logger.warn("'git branch -D' or 'git push origin --delete' failed: %s", e.message);
                            return {
                                edited: false,
                                success: false,
                                target: p,
                                error: e,
                            };
                        }
                    } else if (options.onRebaseFailure === RebaseFailure.Fail) {
                        return {
                            edited: false,
                            success: false,
                            target: p,
                            error: e,
                        };
                    }
                }
            }
        }

        return p;
    };
}
