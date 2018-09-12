import { automationClientInstance } from "@atomist/automation-client";

export function footer() {
    const client = automationClientInstance();
    if (client) {
        return `${client.configuration.name}/${client.configuration.version}`;
    } else {
        return undefined;
    }

}
