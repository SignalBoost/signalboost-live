# Buyer handoff validation hardening

The buyer handoff manifest validates the complete packaging evidence-chain identity before accepting a handoff. It requires canonical phases, valid source and artifact digests, a positive version code, and a valid version name.

Handoff references are decoded and checked for credential-shaped query parameters, including API keys and access tokens. The contract remains read-only and performs no signing, upload, publication, or production mutation.
