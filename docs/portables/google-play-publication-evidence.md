# Google Play publication evidence

SignalBoost validates metadata supplied by an external Google Play release operator. It does not upload an Android App Bundle, call the Google Play Developer API, change a release track, start a rollout, or publish an application.

## Required prerequisites

Publication evidence is accepted only when both of these prior contracts are valid:

- `signalboost-android-publication-readiness-v1` with state `publication_ready`;
- `signalboost-android-signed-bundle-evidence-v1` with state `signed_bundle_evidence_validated`.

The package identity and signed AAB SHA-256 digest must match those prerequisite reports.

## Validated metadata

The contract validates:

- portable and package identity;
- positive version code and bounded version name;
- supported release track;
- signed AAB digest linkage;
- opaque Play edit and release references;
- rollout percentage;
- review status;
- unique ISO-style country codes;
- ordered submission and review timestamps;
- strict false values for automatic rollout, SignalBoost upload, Play API invocation, publication, and production execution.

Credential-shaped references, access tokens, service-account material, embedded secrets, traversal references, unsupported states, and production claims fail closed.

## State meaning

`publication_evidence_validated` means the supplied metadata is internally consistent and linked to earlier validated evidence. It does not mean SignalBoost uploaded the bundle, Google approved the release, the release is live, or production publishing occurred.

`production_published` remains outside this contract and requires independent, externally produced evidence.
