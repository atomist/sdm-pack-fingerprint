import { logger } from "@atomist/automation-client";
import { ApplyFingerprint, ExtractFingerprint, FP, renderData, sha256 } from "../..";

interface ReactVersions {
    react: string;
    "react-dom": string;
}

interface External {
    externals: ReactVersions;
}

interface BackpackedPackage {
    "backpack-react-scripts": External;
}

export const backpackFingerprint: ExtractFingerprint = async p => {

    const file = await p.getFile("package.json");

    if (file) {

        const packagejson = JSON.parse(await file.getContent()) as BackpackedPackage;
        const data: string = JSON.stringify(packagejson["backpack-react-scripts"].externals);

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
    const file = await p.getFile("package.json");
    if (file) {
        const packagejson = JSON.parse(await file.getContent()) as BackpackedPackage;
        packagejson["backpack-react-scripts"].externals = JSON.parse(fp.data);
        await file.setContent(JSON.stringify(packagejson));
        return true;
    }
    return false;
};
