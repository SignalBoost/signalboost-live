# Cyber advisory cross-range repair

Date: September 11, 2026 (America/New_York)

## Reported failure and correction

PR #2144 review comment 3994485076 demonstrated that fixed boundaries from overlapping sibling ranges could nominate a version still affected by the same advisory. For current 1.2.3, ranges [0,1.2.4) and [1.2.0,1.2.5) must never nominate 1.2.4.

The scanner now uses one strict interval parser for both candidate selection and exclusion. Every candidate is checked against all matching affected entries, all sibling ranges, and explicit affected versions. Open-ended intervals and inclusive last_affected boundaries remain affected. Malformed or unsupported sibling evidence blocks a recommendation rather than being silently ignored. The advisory, severity and descriptive evidence remain visible. Compatible stable-version and zero-major minor boundaries remain unchanged; no broader remediation authority is introduced.

Fourteen new executable scanner regressions cover cross-range and cross-entry overlap in either order, open-ended ranges, future reintroduction, inclusive last_affected, limit, malformed and unsupported siblings, explicit versions, disjoint ranges, duplicates and unrelated packages. On exact prior head scanner blob 9df320998b21253d587b16dfc0bbbaba127c043f, eleven fail and three pass. After repair, all fourteen pass. The unchanged original fourteen tests also pass: 28/28 focused tests, zero failures and zero skips. Local execution uses a partial source assembly with injected host ports, not a full repository checkout or authenticated Production scan.

Tested/uploaded scanner blob: ec6d209178e6c32116bc99409b44f97bbc91939f.
New test blob: 7df4c9c13025257d12153f260f49ae15febd47a4.
Original test blob retained: e5105429300aee4055b36879bc2cc96d3edab924.
The new suite is imported through the existing cybersecurityLiveProgress gate; no prior test is removed.

## Current-state reconciliation

Current main 7481ee412abf0fd6ea4fd32572131cb521091b59 was rescanned. Its scanner blob 25639351a8ddc67f405d306db60f48f45d198900 was reconstructed and hash-verified: its overlapping change restored an earlier less-strict interval parser. The repaired parser supersedes that version while retaining all other scanner inventory, coverage, exact-version, unresolved-range, and OSV behavior. All unrelated current-main University and dependency work is preserved in the integration tree. ONBOARD remains blob 8977628013bb9306ad0c989f8baab88b616509e4.

The owner's latest pasted dashboard contains a successful 120-package scan with four classified findings but old approval controls. Current-main dashboard blob 21da921f60f159c011bb9219fffaa4d4cca5cef1 still contains the saved-plan archive/reassessment controls and unclassified counts. A stale loaded client is a plausible explanation, not an authenticated browser diagnosis. No saved requests, approval records, alerts or scan histories are rewritten.

## Release boundary

The existing Contents-read-only Cyber Live Evidence workflow and script are retained. New-head CI, TypeScript/build, Preview and review must pass before an expected-head merge. Production and authenticated end-to-end acceptance are separate claims. This change repairs scanner recommendations; it does not upgrade installed packages or resolve the owner's reported vulnerabilities.
