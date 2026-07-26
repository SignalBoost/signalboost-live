# Google Play External Android Build Evidence

## Status

SignalBoost can validate metadata describing an unsigned Android build produced in a buyer-controlled environment.

The validator does not read the AAB, access a filesystem, run Gradle, invoke the Android SDK, contact a network service, sign an artifact, upload to Google Play, or execute production behavior.

## Evidence required

The external evidence record includes portable and package identity, scaffold and build-plan schema versions, source commit SHA, JDK/Android SDK/Gradle versions, lint and test outcomes, the relative unsigned AAB path, SHA-256 digest, and ordered build timestamps.

## State progression

- `build_plan_ready` means the build process is defined but not executed by SignalBoost.
- `evidence_validated` means supplied external metadata passed deterministic validation.
- `signed_bundle_ready` requires a separate approved signing process and verified signed artifact. This repository does not claim that state.
- `play_console_published` requires retained Google Play publication evidence. This repository does not claim that state.

## Safety boundary

Evidence with signed, uploaded, published, or production-execution claims is blocked. Validation never proves that an artifact exists; buyers must independently retain and audit the actual AAB, logs, digests, signing records, and store evidence.
