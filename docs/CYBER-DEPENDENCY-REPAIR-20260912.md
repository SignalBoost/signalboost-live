# Dependency remediation — September 11 Eastern / September 12 UTC, 2026

## Scope

Owner-authorized follow-on to scanner PR #2144. Baseline main was
`b2e91e1492d6f71335172926a0eda835c534fa26`; newer main
`793269f0721e4beb3cdc287db7914f95e43a34f5` is now integrated, preserving its
three University practice-selection files byte-for-byte. This repairs dependencies,
not historical scan/approval records. No database, Guardian/Stranger permissions,
tenant controls or runtime provider settings change.

## Verified baseline and candidate

Live npm registry audits at 02:40–02:43 UTC inspected both complete committed
lockfiles, not the dashboard's 120-package sample. npm's package-level findings
must not be compared directly with OSV advisory-instance counts.

| Scope | Baseline | Regenerated candidate |
| --- | --- | --- |
| Root | 8 vulnerable packages: 1 critical, 5 high, 1 moderate, 1 low | 0 reported vulnerabilities across 492 dependencies |
| SaaS | 6 vulnerable packages: 4 high, 2 moderate | 0 reported vulnerabilities across 534 dependencies |

The root baseline lock was stale: its name and dependency declarations disagreed
with package.json and omitted already-declared runtime and test dependencies.
Regeneration restores those declarations; no new direct dependency is requested.
Root next changes from 16.2.6 to 16.3.5. Both manifests raise the PostCSS minimum
from ^8.4.31 to ^8.5.23. Every other manifest field, including scripts, remains
unchanged. The existing SaaS Next.js 16.3.5 and LangGraph dependencies are preserved.

Targeted compatible transitive refreshes repair Browserslist, browser mapping,
form-data, nanoid, selector parsing, brace expansion, YAML and query parsing.
Next.js brings its patched PostCSS/native image stack. Resolution used npm's
registry metadata and integrity values; no lockfile integrity was invented.
No force upgrade or lifecycle install scripts were used.

## Evidence

GitHub Actions run `34668404671` on source commit
`c260c06b41a919318fe2062b19d2b677787423f7` completed both candidate resolution and
isolated blob publication successfully. Both post-change npm audits returned exit
0, and both clean `npm ci --ignore-scripts` installations returned exit 0 without
changing the candidate bytes. Before audits returned exit 1.

Candidate artifact `10289841025` SHA256:
`063bd9ecf9b6a73e799d8203009e657b21acfd3fff3e8786c8e644ac3355ebc8`.
Blob manifest artifact `10290070672` SHA256:
`009a82415a1b70e8cc59b36c4b3d42dabc3c8abe16317cd508bbfd7485d58c9a`.
Downloaded artifacts and every candidate file hash were independently checked.

| Path | Verified candidate Git blob |
| --- | --- |
| package.json | 393e6c667851f61fb16164ebb82ee205cb8c3fa6 |
| package-lock.json | 47b54cc13894a25e2fb6845ee8eef8bcf4c0b3dd |
| saas/package.json | cf821e52ab36ac5eb3bace3325a47000477ea74c |
| saas/package-lock.json | f8c19806a4cadde1da98473cfea418a19f6e6562 |

The static dependency-integrity checks fail each exact baseline and pass both
regenerated lockfiles locally using artifact files, not a full repository checkout.
Actual installed-library checks in Actions run `34668841024` on integration head
`714137d716ccdf1f1b652b082287aba93023522e` passed for BOTH workspaces: CSS,
browser queries, multipart escaping, identifiers, query/YAML parsing and native
image processing. Both fresh full-lockfile audits and clean installations passed.
The initial Sharp package.json export assumption was corrected without dropping
installed-version or native image assertions.

## Build scope and independent review

Review `3994841359` correctly identified a pre-existing root build defect.
Root job `103486172248` reproduced MODULE_NOT_FOUND for
`scripts/validate-next-route-config.mjs` before Next.js started. The root prebuild
also references other validators that exist only under saas/scripts. This task
does not claim to repair or validate that standalone root application build.

The new read-only workflow retains BOTH committed graphs' npm ci, manifest/lock
agreement, nested known-regression floors, library smoke tests, fresh npm audit
and unchanged-file checks. Its full `npm run build` step is scoped to `saas`,
the actual Vercel project root. SaaS prebuild validators and all existing CI remain
mandatory and unchanged. No failed build is ignored or reported as successful.
This is dependency verification for both trees and full-build verification for
the deployed SaaS application, not full application acceptance of the root tree.

Temporary task-branch collection/resolution tooling is removed from the final
tree. Its isolated publisher stored only four content-addressed Git blobs; it
never updated a branch, opened/merged a PR, changed Production or used provider
secrets. Repository integration remains the protected expected-head PR merge.

## Release boundary

Candidate audit success is not Production acceptance or a security certification.
Latest-head CI, SaaS build, Preview, independent review and expected-head merge
remain required; verify the exact merged deployment separately. Historic dashboard
alerts/approvals remain unchanged and need a fresh scan for current status.
