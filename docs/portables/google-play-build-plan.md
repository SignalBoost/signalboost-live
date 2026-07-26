# Google Play Android Build Plan

## Status

The repository can now derive a deterministic Android build plan from a reviewed unsigned TWA scaffold.

This is a planning contract only. It does not create files, invoke Gradle, install an Android SDK, generate an APK or AAB, sign an artifact, upload to Play Console, or execute production behavior.

## State progression

1. `metadata_ready` — validated portable Android metadata exists.
2. `scaffold_ready` — deterministic unsigned project text exists in memory.
3. `build_plan_ready` — prerequisites, planned tasks, expected artifacts, and evidence requirements are defined.
4. `build_ready` — buyer-controlled tooling and isolated build infrastructure have been verified. This repository does not claim this state yet.
5. `signed_bundle_ready` — an external approved signing process has produced and verified a signed AAB. Not implemented here.
6. `play_console_published` — Google Play publication evidence exists. Not implemented here.

## Build-plan contents

The plan records buyer prerequisites, an ordered build sequence, expected unsigned artifacts, and required evidence such as toolchain versions, source commit, lint/test output, and artifact digest.

All task descriptions are declarative. `commandsExecuted`, `filesystemMutated`, `appBundleGenerated`, `signingEnabled`, `storeSubmissionEnabled`, and `productionExecutionEnabled` remain `false`.

## Buyer responsibilities

The buyer must supply and approve the isolated Android build environment, JDK, Android SDK, dependency access, release signing process, Digital Asset Links fingerprint, security review, store assets, privacy disclosures, Data Safety answers, and Play Console actions.
