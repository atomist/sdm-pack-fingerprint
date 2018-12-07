import { logger } from "@atomist/automation-client";
import { DockerfileParser, From } from "dockerfile-ast";
import { FP, renderData, sha256 } from "../..";
import { ApplyFingerprint, ExtractFingerprint } from "../machine/FingerprintSupport";

export const dockerBaseFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("Dockerfile");

    if (file) {

        const dockerfile = DockerfileParser.parse(await file.getContent());
        const instructions = dockerfile.getInstructions();
        let data: string = "";

        for (const instruction of instructions) {
            if ("FROM" === instruction.getKeyword()) {
                data = (instruction as From).getImage();
            }
            logger.info(`instruction:  ${instruction.getKeyword}  ${instruction.getInstruction()}`);
        }

        const fp: FP = {
            name: "docker-base-image",
            abbreviation: "dbi",
            version: "0.0.1",
            data,
            sha: sha256(data),
        };

        // bug opened and fix coming
        (fp as any).value = data;

        return fp;
    } else {

        return null;
    }
};

export const applyDockerBaseFingerprint: ApplyFingerprint = async (p, fp) => {
    logger.info(`apply ${renderData(fp)} to ${p.baseDir}`);
    return true;
};
