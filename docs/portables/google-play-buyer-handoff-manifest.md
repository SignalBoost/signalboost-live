# Google Play buyer handoff manifest

SignalBoost validates metadata for a human-controlled buyer handoff after the Android packaging evidence chain has passed. The manifest does not transfer credentials, signing keys, Android artifacts, Google Play access, publication authority, or production control.

## Required prerequisite

The supplied packaging report must use `signalboost-android-packaging-evidence-chain-v1`, have state `packaging_evidence_chain_validated`, contain no blockers, include the canonical six packaging phases, preserve valid commit, digest, and release identities, and retain read-only safety flags.

## External responsibilities

The buyer remains responsible for:

1. signing-key custody;
2. Google Play Console access;
3. Android App Bundle upload;
4. review responses;
5. rollout control;
6. store publication;
7. live-store verification.

## State meaning

`buyer_handoff_manifest_validated` means the supplied handoff metadata is internally consistent and acknowledges the external responsibilities. It does not mean SignalBoost transferred secrets, accessed an artifact, called Google Play, uploaded a bundle, changed rollout, published an application, deployed production code, or enabled production execution.
