import * as assert from "assert";
import { constructNpmDepsFingerprintName, deconstructNpmDepsFingerprintName } from "../../lib/fingerprints/npmDeps";

describe("npmDeps", () => {
    it("constructs and deconstructs a fingerprint name", () => {
        const original = "@atomist/sdm";

        const fingerprintName = constructNpmDepsFingerprintName(original);

        const result = deconstructNpmDepsFingerprintName(fingerprintName);

        assert.strictEqual(result, original);
    });

    it("constructs and deconstructs a fingerprint name", () => {
        const original = "lodash";

        const fingerprintName = constructNpmDepsFingerprintName(original);

        const result = deconstructNpmDepsFingerprintName(fingerprintName);

        assert.strictEqual(result, original);
    });

    it("returns undefined for an unknown fingerprint name", () => {
        const result = deconstructNpmDepsFingerprintName("another-fingerprint::and::stuff");

        assert.strictEqual(result, undefined);
    });

    it("doesn't freak out on undefined", () => {
        const result = deconstructNpmDepsFingerprintName(undefined);

        assert.strictEqual(result, undefined);
    });

    it("doesn't freak out on empty string", () => {
        const result = deconstructNpmDepsFingerprintName("");

        assert.strictEqual(result, undefined);
    });
});
