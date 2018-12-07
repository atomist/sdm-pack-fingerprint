import { logger } from "@atomist/automation-client";
import { ApplyFingerprint, ExtractFingerprint, FP, renderData, sha256 } from "../..";

export const backpackFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("package.json");

    if (file) {

        const packagejson = JSON.parse(await file.getContent());

        // tslint:disable-next-line:no-string-literal
        const data: string = JSON.stringify(packagejson["backpack-react-scripts"]["externals"]);

        const fp: FP = {
            name: "backpack-react-scripts",
            abbreviation: "backpack",
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

export const applyBackpackFingerprint: ApplyFingerprint = async (p, fp) => {

    logger.info(`apply ${renderData(fp)} to ${p.baseDir}`);

    if (await p.hasFile("package.json")) {
        const file = await p.getFile("package.json");
        const packagejson = JSON.parse(await file.getContent());

        // tslint:disable-next-line:no-string-literal
        packagejson["backpack-react-scripts"]["externals"] = JSON.parse(fp.data);
        await file.setContent(JSON.stringify(packagejson));
        logger.info(`new package json ${renderData(packagejson)}`);
        return true;
    } else {
        logger.info("package.json does not exist");
        return false;
    }
};
