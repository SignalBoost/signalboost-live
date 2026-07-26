<!-- saas/portable-release/provider-hub.RELEASE-NOTES.md -->

# Provider Hub 1.0.0-rc.1

This release candidate packages the bounded Provider Hub core for independent buyer verification.

## Included

- redacted provider connection metadata;
- provider-neutral live-data read adapter contracts;
- immutable live-data read evidence;
- buyer-facing BYOK and security/operations documentation;
- deterministic manifest, SBOM, SHA-256 checksums, and archive.

## Buyer responsibilities

The buyer supplies provider credentials, vault integration, persistence, network transport, authorization, approvals, quota and spend controls, audit transport, deployment, and production operations.

## Explicitly not included

- credentials, access tokens, OAuth clients, or service-account material;
- provider write or mutation execution;
- automatic approval or rollout;
- hosted infrastructure or database;
- production deployment or publication.

## Acceptance boundary

A successful release workflow proves that the archive can be built, independently verified, checksum-validated, extracted cleanly, and scanned for credential-shaped material. It does not prove buyer deployment acceptance or production provider access.
