import {BaseAspect, FP} from "./Aspect";
import {BuildListener, BuildListenerInvocation} from "@atomist/sdm";
import {BuildStatus} from "../typings/types";

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
