# Provider Hub unsigned build evidence bundle

This contract validates externally supplied, read-only metadata for an unsigned Provider Hub Android build. It aggregates source, schema, dependency-review, asset, toolchain, verification, artifact, build-log, dependency-lock, and evidence-index identities into one deterministic immutable report.

The contract fails closed for missing or unknown evidence keys, schema and package mismatches, malformed hashes, unsafe artifact paths, dynamic toolchain values, unapproved repositories, credential-shaped values, malformed evidence entries, and any signing, upload, publication, or production-execution claim.

The validated state means only that the supplied metadata is internally consistent. SignalBoost does not read files, resolve dependencies, access a network, execute Gradle, generate an APK or AAB, sign an artifact, upload to Google Play, publish a release, mutate infrastructure, or enable production browser automation.
