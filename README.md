## Using this Extension pack

1.  add the extension pack to your machine

```
import { FingerprintSupport } from "@atomist/sdm-pack-fingerprints"

sdm.addExtensionPacks(
    FingerprintSupport
)
```

2.  enable the `FingerprintGoal` in some push rules

```
whenPushSatisfies(IsLein)
            .itMeans("run some fingerprints on your clojure code")
            .setGoals([FingerprintGoal]),
```