import * as crypto from "crypto";

/**
 * Uses Node.js standard crypto module to calculate a
 * sha256 hash of the provided object.
 */
export function sha256(obj: any): string {
    let content = obj;
    if (typeof obj !== "string") {
        content = JSON.stringify(obj);
    }
    const hash = crypto.createHash("sha256");
    hash.update(content);
    return hash.digest("hex");
}
