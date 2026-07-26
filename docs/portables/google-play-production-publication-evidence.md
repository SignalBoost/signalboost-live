# Google Play production publication evidence

SignalBoost validates metadata supplied by an external Google Play release operator after the existing release-evidence and publication-evidence contracts have passed. SignalBoost does not read an Android artifact, call the Google Play Developer API, upload an Android App Bundle, change rollout settings, publish an application, deploy production code, or verify a live listing over the network.

## Required prerequisites

Production-publication evidence is accepted only when both prior reports are valid:

- `signalboost-android-play-console-release-evidence-v1` with state `release_evidence_ready` and rollout eligibility;
- `signalboost-android-publication-evidence-v1` with state `publication_evidence_validated`.

Portable identity, package identity, version metadata, production track, and signed AAB SHA-256 linkage must remain consistent.

## Validated metadata

The contract validates:

- positive version code and bounded version name;
- production release track;
- approved review status;
- complete 100% rollout evidence;
- unique two-letter country scope;
- opaque public-listing and publication-outcome references;
- ordered publication and verification timestamps;
- exact false values for every SignalBoost upload, API, rollout, publication, deployment, and production-execution claim.

Credential-shaped references, embedded identities, secrets, traversal references, malformed input, mismatched prerequisites, incomplete rollout, unsupported states, and unsafe execution claims fail closed.

## State meaning

`production_publication_evidence_validated` means externally supplied metadata is internally consistent and linked to the prior validated reports.

It does not mean SignalBoost published the app, independently contacted Google Play, or verified the live store listing through network access. Actual signing, upload, review, rollout, publication, and live-store verification remain external responsibilities.
