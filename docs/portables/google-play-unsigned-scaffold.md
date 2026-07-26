# Google Play unsigned Android scaffold

## Status

This phase produces a deterministic in-memory map of reviewable Android project text for a Trusted Web Activity. It does not write files, invoke Gradle, call the Android SDK, generate an APK or Android App Bundle, configure signing, or communicate with Google Play Console.

## State model

1. `metadata_ready`: portable identity, package name, launch URL, icons, and distribution claims are validated.
2. `scaffold_ready`: deterministic unsigned project text can be reviewed or exported by a separately approved tool.
3. `build_ready`: buyer-controlled Android tooling, pinned dependencies, icons, web manifest, service worker, and Digital Asset Links inputs have been verified.
4. `signed_bundle_ready`: a buyer-controlled release pipeline has produced and verified a signed AAB using an opaque signing reference.
5. `play_console_published`: Play Console evidence confirms the intended testing or production track.

Only the first two states are implemented by the scaffold planner. A scaffold-ready result must never be described as an Android build, signed bundle, store submission, or published application.

## Generated plan

`saas/portable-mobile/android-scaffold.ts` accepts a validated TWA `AndroidPackagingDescriptor` and returns a frozen file map containing Gradle settings, application configuration, an Android manifest, Digital Asset Links guidance, and a safety README.

The Provider Hub example uses `com.signalboost.providerhub` and the authenticated launch URL `https://signalboostapp.com/dashboard/provider-hub`.

## Safety boundary

The planner rejects Capacitor descriptors, signing configuration, publication claims, and states beyond metadata/build readiness. It contains no filesystem, shell, network, Gradle, Android SDK, signing, deployment, or Play Console capability. Certificate fingerprints and raw signing material are not accepted or generated.
