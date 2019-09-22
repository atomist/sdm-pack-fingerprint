import { addressEvent } from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";

export function updateScopeCommand(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<{scope: string }> {
    return {
        name: "UpdateScope",
        intent: `update scope ${sdm.name.replace("@", "")}`,
        parameters: {
            scope: {},
        },
        listener: async ci => {
            await ci.context.messageClient.send(JSON.parse(ci.parameters.scope), addressEvent("PolicyTargetScope"));
        },
    };
}
