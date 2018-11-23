# @atomist/sdm-pack-fingerprints

[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist/sdm-pack-fingerprints/04e080df-3333-4783-82d3-a4c76637827b)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-fingerprint/next.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-fingerprint/v/next)

[Atomist][atomist] software delivery machine (SDM) extension pack
providing fingerprinting support.

See the [Atomist documentation][atomist-doc] for more information on
what SDMs are and what they can do for you using the Atomist API for
software.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Features

This pack sets a goal to monitor all git pushes and trackes the following features:

* leiningen `project.clj` files are monitored for updates to library dependencies and project version.
* maven `pom.xml` files are monitored for updates to maven library dependencies and version coordinates.
* npm `package.json` files are monitored for updates to module dependencies and package version changes.

This monitoring happens computing a set of fingerprints on every commit.  The fingerprints that are computed
depend on the type of project.  We currently compute fingerprints for maven, clojure, and npm projects.

* npm-project-deps, clojure-project-deps, and maven-project-deps
* npm-project-coordinates, clojure-project-coordinates, maven-project-coordinates

When a new fingerprint is computed, we can drive interesting behaviors such as:

* check whether a library is up to date with a set of team-wide goals and offer to push a PR if not
* check whether a new version of a library is available and check whether consumers need to update to this new version

## Usage

Make the following updates to your machine:

1. Add the imports and create a Goal to represent dependency fingerprinting

```
import { fingerprintSupport } from "@atomist/sdm-pack-fingerprints";
import { Fingerprint } from "@atomist/sdm";

// create a goal to fingerprint all new Pushes
export FingerprintGoal = new Fingerprint();
```

2. Enable the `FingerprintGoal` for some push rules.  Normally, this is done as part of creating your machine:

```ts
    // there will usually be more than one Push rule here
    const sdm = createSoftwareDeliveryMachine({
            ...config
        },
        whenPushSatisfies(IsLein)
            .itMeans("fingerprint a clojure project")
            .setGoals(FingerprintGoal));

```

3.  Add the pack to your new `sdm` definition:

There'll be some new imports:

```ts
import {
    fingerprintSupport,
    forFingerprints,
    renderDiffSnippet,
    depsFingerprints,
    logbackFingerprints,
    renderData,
    applyFingerprint,
    FP,
} from "@atomist/sdm-pack-fingerprints";

```

and then you'll have to add the extension pack to your machine definition:

```ts
    // add this pack to your SDM
    sdm.addExtensionPacks(
        fingerprintSupport(
            FingerprintGoal,
            async (p: GitProject) => {
                // COMPUTE fingerprints: called on every Push
                return depsFingerprints(p.baseDir);
            },
            async (p: GitProject, fp: FP) => {
                // APPLY fingerprint to Project (currently only through user actions in chat)
                return applyFingerprint(p.baseDir, fp);
            },
            {
                selector: forFingerprints("backpack-react-scripts"),
                handler: async (ctx, diff) => {
                    // HANDLE new fingerprint (even if it hasn't changed in this push)
                    return checkFingerprintTargets(ctx, diff);
                },
                diffHandler: async (ctx, diff) => {
                    // HANDLE new fingerprint (only when the fingerprint sha is updated)
                    return renderDiffSnippet(ctx, diff);
                },
            },
        ),
    )
```

In the example above, we have a module which computes a set of fingerprints on every `Push` (one of them is named `backpack-react-scripts`).  The pack also notices if a newly
computed fingerprint has either changed, or is different from a `goal` state.  It will then present the user with options to do things like:

* set new targets 
* update a project to be in sync with a target fingerprint
* apply a fingerprint to a project for the first time
* broadcast a message to all projects out of sync with the fingerprint

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/sdm-pack-fingerprints/issues

## Development

You will need to install [node][] to build and test this project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Use the following package scripts to build, test, and perform other
development tasks.

Command | Reason
------- | ------
`npm install` | install project dependencies
`npm run build` | compile, test, lint, and generate docs
`npm run lint` | run TSLint against the TypeScript
`npm run compile` | generate types from GraphQL and compile TypeScript
`npm test` | run tests
`npm run autotest` | run tests every time a file changes
`npm run clean` | remove files generated during build

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack

