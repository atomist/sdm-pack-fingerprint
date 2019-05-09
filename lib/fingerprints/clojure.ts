import { applyFingerprint, cljFunctionFingerprints, depsFingerprints, logbackFingerprints, renderClojureProjectDiff } from "../../fingerprints";
import { FingerprintRegistration } from "../machine/fingerprintSupport";

export const Logback: FingerprintRegistration = {
    extract: p => logbackFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => fp.name === "elk-logback",
};

export const LeinMavenDeps: FingerprintRegistration = {
    extract: p => depsFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => {
        return fp.name.startsWith("maven-project") || fp.name.startsWith("clojure-project");
    },
    summary: renderClojureProjectDiff,
};

export const CljFunctions: FingerprintRegistration = {
    extract: p => cljFunctionFingerprints(p.baseDir),
    apply: (p, fp) => applyFingerprint(p.baseDir, fp),
    selector: fp => fp.name.startsWith("public-defn-bodies"),
};
