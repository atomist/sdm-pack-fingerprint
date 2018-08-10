import {Configuration} from "@atomist/automation-client";
import {FingerprintGoal, PushTest, pushTest, SoftwareDeliveryMachine, whenPushSatisfies} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,

} from "@atomist/sdm-core";
import {SoftwareDeliveryMachineConfiguration} from "@atomist/sdm/api/machine/SoftwareDeliveryMachineOptions";
import {FingerprintSupport} from "..";

const IsNpm: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("package.json")),
);
const IsLein: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("project.clj")),
);

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
            name: `${configuration.name}-test`,
            configuration: config,
        },
        whenPushSatisfies(IsLein)
            .itMeans("fingerprint a clojure project")
            .setGoals(FingerprintGoal),
        whenPushSatisfies(IsNpm)
            .itMeans("fingeprint an npm project")
            .setGoals(FingerprintGoal));

    sdm.addExtensionPacks(FingerprintSupport);

    return sdm;

}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
