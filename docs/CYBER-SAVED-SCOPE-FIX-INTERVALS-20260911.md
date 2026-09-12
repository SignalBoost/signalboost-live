# Cybersecurity saved scope and applicable fix evidence

Date: 2026-09-11

Follow-up to PR #2141, whose independent review arrived after merge. Addresses both P2 comments: 3994247362 and 3994247365.

## Corrections

The normalized fixedVersions list now contains only stable, compatible upward fixes whose affected interval includes the exact scanned version. Earlier and future intervals remain in descriptive affectedRanges but cannot become the persisted plan's first target. Breaking-major updates, prerelease/ambiguous boundaries, incomplete intervals and last_affected/limit boundaries do not supply routine patch authority. Compatible candidates are numerically sorted before entering plan evidence. No installed dependency is updated and the execution gate remains unchanged.

Reassessment validates and retains the saved GitHub tree/blob target, including its branch and repository subpath. It verifies that the target still names the stored repository. Invalid explicit targets, traversal, credentials, neighboring repositories, unrelated paths and unsupported encodings fail closed; they never silently fall back to the full repository. Repo-only fallback is used only when the saved target is absent or is already the same owner/repo reference. Saved records are never rewritten.

## Verification

Four additional regressions failed against merged #2141; all eighteen scanner and dashboard regressions pass with these corrections. The tests execute the actual scanner/component modules with injected host ports. All four uploaded source/test blob hashes match tested local bytes. Existing tests remain registered through cybersecurityLiveProgress. This is partial local assembly evidence, not authenticated Production or a live OSV scan. Full current-head CI, Preview and exact-commit Production deployment are verified separately.

No migration, approval-state modification, new mutation authority, Guardian repair or Stranger permission is introduced.
