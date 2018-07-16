import { Configuration } from "@atomist/automation-client";
import { SoftwareDeliveryMachine } from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import { SoftwareDeliveryMachineConfiguration } from "@atomist/sdm/api/machine/SoftwareDeliveryMachineOptions";
import { FingerprintSupport } from "../src";

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
        name: `${configuration.name}-test`,
        configuration: config,
    });

    // put in other things you need for your test

    sdm.addExtensionPacks(FingerprintSupport);

    return sdm;

}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
