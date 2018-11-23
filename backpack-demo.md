## Backpack Demo Script

### Install Pack

```ts
// add new imports!
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


    // add this to your machine definition
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
            },
        ),
    )
```

### Backpack react scripts

Our demo fingerprint works on a snippet of package.json

```json
  "backpack-react-scripts": {
    "externals": {
      "react": "v7.1",
      "react-dom": "v7.1"
    }
  },
```

We treat this whole section as one fingerprint.

## Demo Flow

### start with node project 0

We'll assume here that you're starting with no projects containing this section.

1.  open `package.json` and add the above section
2.  push a commit

* verify that you see Atomist run the `FingerprintGoal` on the next Push.
* Atomist will have added a Fingerprints (which you can see with `@atomist listFingerprints`) but there will be no targets for this fingerprint

> Action: run `@atomist setFingerprintGoal fingerprint=backpack-react-scripts`

* this will set a team-wide preference for this fingerprint (which you can debug with `@atomist dump preferences`)

### Projects 1 and 2

Have at least two more node projects, each having the `backpack-react-scripts` secion.  

> Action:  make some random commit changing one of the backpack-react-scripts section to be different from the goal

* Atomist will present you with two options.

> Action:  Select "Set as Target"

This will update the target (meaning that project 0 will now be out of sync with the target)

> Action:  Select "broadcast fingerprint"

Notice that the bot will send a message to the channel of project 0 nudging it to update.  You'll also see nudges in other channels for projects containing backpack-react-scripts.

### Update one of the projects

> Action: click on the "Update project" button in one of the channels

* show that the goal fingerprint is applied in a PR
* show the PR synchronizes the `backpack-react-scripts` if merged

### Add backpack-react-scripts to a project that doesn't have them

Find another project that does not have a `backpack-react-scripts` currently.

> Action: type `@atomist applyFingerprint fingerprint=backpack-react-scripts`

* demonstrate that fingerprints can also be used to add functionality into a project (join the party so to speak)
