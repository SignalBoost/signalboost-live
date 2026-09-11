# Cybersecurity advisory details and saved-plan presentation

Date: 2026-09-11

## Reported defects

The owner supplied the Cybersecurity Center output after PR #2139. June/July dependency plans still exposed obsolete blanket-approval instructions. One approved request displayed both "No approval pending" and "Approve plan". All 15 current findings had unknown severity and generic descriptions while critical/high counters showed zero.

## Repair

OSV querybatch returns advisory IDs and modification timestamps, not full vulnerability records. The scanner now hydrates each distinct ID from the fixed OSV detail endpoint before extracting severity, descriptions, references, aliases and package-specific fixed versions. It follows bounded per-package pagination and rejects incomplete batch responses. Detail fetches use concurrency four, a shared 45-second deadline, ten-second request timeouts and a 250-ID hydration limit. Unavailable or mismatched detail records retain their original batch finding as explicitly unclassified with no fixed-version authority. Unsupported CVSS-only severity remains unknown rather than guessed.

Legacy approval-gated dependency plans retain their original summary, plan, policy wording and implementation notes in a labelled, closed historical section. The misleading dependency approval action is replaced by a read-only reassessment of the saved repository. Reassessment neither approves nor rewrites that request. Current approval-free plans keep their verification blockers visible. Guardian disposition controls and the existing server-side authorization/CAS rules are unchanged.

Unclassified severity is visible in the current report, top-level counters and saved-scan history, with a warning that zero critical/high values do not prove harmlessness. Monitor totals carry the same qualification. Newly displayed patched-version suggestions cannot select a downgrade or incompatible major. New labels support English, Spanish, Portuguese, Polish and Russian.

## Authority and data boundaries

No migration, saved approval rewrite, dependency update, containment, merge authority or Stranger permission is introduced by this implementation. Previously saved scans retain their historical values; new scans use the corrected enrichment. PDF export already consumes report descriptions/severity and explicitly warns about unknown severity, so it is not independently changed.

## Verification

Fourteen executable focused tests exercise the real scanner and rendered TSX components with injected host ports. The exact original scanner/dashboard blobs reproduced eleven failing cases and three passing cases. The repaired sources pass fourteen of fourteen. The existing cybersecurityLiveProgress registration imports both new suites without removing the earlier autonomy, approval-claim or progress regressions. Six changed TypeScript/TSX files pass syntax checks.

The local environment is a partial source assembly, not a full checkout. These tests are not a live OSV scan, authenticated browser acceptance, full TypeScript check or Production proof. Full current-head CI and Vercel Preview remain mandatory before merge; exact-commit Production deployment and runtime evidence are verified separately.

## Primary API contracts

- https://google.github.io/osv.dev/post-v1-querybatch/
- https://google.github.io/osv.dev/get-v1-vulns/
- https://ossf.github.io/osv-schema/
