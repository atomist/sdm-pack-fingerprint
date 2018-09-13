# @atomist/sdm-pack-fingerprints

[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist/sdm-pack-fingerprints/04e080df-3333-4783-82d3-a4c76637827b)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-fingerprint/next.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-fingerprint/v/next)

[Atomist][atomist] software delivery machine (SDM) extension pack
providing fingerprinting support.

See the [Atomist documentation][atomist-doc] for more information on
what SDMs are and what they can do for you using the Atomist API for
software.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

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

```
    // there will usually be more than one Push rule here
    const sdm = createSoftwareDeliveryMachine({
            ...config
        },
        whenPushSatisfies(IsLein)
            .itMeans("fingerprint a clojure project")
            .setGoals(FingerprintGoal));

```

3.  Add the pack to your new `sdm` definition

```
    // add this pack to your SDM
    sdm.addExtensionPacks(
        fingerprintSupport(FingerprintGoal),
    )
```

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

