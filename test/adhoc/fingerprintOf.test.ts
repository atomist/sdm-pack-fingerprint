import {fingerprintOf} from "../../lib/adhoc/construct";

import * as assert from "assert";

describe("fingerprintOf", () => {

    it("should default to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}});
        assert.strictEqual(fp.path, undefined);
    });

    it("should default . to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: "."});
        assert.strictEqual(fp.path, undefined);
    });

    it("should default empty string to undefined path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: ""});
        assert.strictEqual(fp.path, undefined);
    });

    it("should take custom path", async () => {
        const fp = fingerprintOf({ type: "thing", data: { count: 0}, path: "thing2"});
        assert.strictEqual(fp.path, "thing2");
    });

});
