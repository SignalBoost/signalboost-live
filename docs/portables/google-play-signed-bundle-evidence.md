# Google Play Signed Bundle Evidence

## Status

SignalBoost can validate metadata describing a buyer-produced signed Android App Bundle without reading the bundle, accessing signing material, running Android tooling, or contacting Google Play.

## Required evidence

The contract requires a previously validated unsigned build-evidence report, matching portable and package identity, distinct unsigned and signed SHA-256 digests, a relative signed AAB path, a certificate SHA-256 fingerprint, an opaque signing-key reference, a signer-attestation reference, and ordered signing timestamps.

## Safety boundary

Raw private keys, passwords, keystore files, keystore paths, signing commands, artifact access, uploads, publication claims, and production execution are rejected or remain disabled.

## State progression

1. `evidence_validated` — external unsigned build metadata passed validation.
2. `signed_bundle_evidence_validated` — external signing metadata passed validation.
3. `play_console_published` — store publication evidence exists. This is not implemented or claimed by this contract.

A validated signed-bundle evidence report does not prove Google Play upload, review, approval, internal testing availability, or production publication.
