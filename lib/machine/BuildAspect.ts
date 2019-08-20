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
    BuildListener,
    BuildListenerInvocation,
} from "@atomist/sdm";
import { BuildStatus } from "../typings/types";
import {
    BaseAspect,
    FP,
} from "./Aspect";

export interface BuildAspect<FPI extends FP = FP> extends BaseAspect<FPI> {

    findFingerprints(bi: BuildListenerInvocation): Promise<FPI[]>;
}

const buildCompletions = [BuildStatus.broken, BuildStatus.error, BuildStatus.failed, BuildStatus.passed];

/**
 * Create an SDM BuildListener from BuildAspect
 * @param {BuildAspect} buildAspect
 * @param {(fps: FP[]) => Promise<void>} publish
 * @return {BuildListener}
 */
export function buildListener(buildAspect: BuildAspect,
                              publish: (fps: FP[]) => Promise<void>): BuildListener {
    return async bi => {
        if (buildCompletions.includes(bi.build.status)) {
            const fps = await buildAspect.findFingerprints(bi);
            await publish(fps);
        }
    };
}
