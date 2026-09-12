# Cyber patch regression and live evidence

Date: September 11, 2026 (America/New_York)

## Regression repair

Concurrent scanner coverage changes after PR #2142 removed applicable interval filtering. Two unchanged advisory-detail regressions fail on scanner blob ca244c28d7bdb9743a1e137d7b66c857c4191c64. Restoring the filter made the original nine cases pass without removing manifest-size, coverage, exact-version or unresolved-range behavior.

Independent review comment 3994442556 then identified consecutive introduced boundaries. The entire range now fails closed for malformed, overlapping, touching, orphaned, multikey or reversed boundaries. Five added executable cases reproduce failures on initial PR scanner d107073c6de2954ce38755e113aa5fe6b4687a2c and pass after hardening. All 14 focused cases pass on scanner 9df320998b21253d587b16dfc0bbbaba127c043f and test e5105429300aee4055b36879bc2cc96d3edab924. Findings remain visible; ambiguous data never becomes patch authority. Local tests used an explicitly partial source assembly.

No saved approvals, worker authority, dependency versions, database records or University evidence are changed by this scanner repair.

## Real read-only evidence

Cyber Live Evidence run 34662069524 on exact head 43175f68bffc845335dadf9c77af2125bc449dbb successfully executed the actual scanner and GitHub reader against live OSV at 2026-09-12T00:34:26Z. Artifact 10288230075 preserves the report (ZIP SHA256 925b2ddd0b20409f428f49dba2fdd074acd4ab31450c89b5c786162ff50185b5).

Root-scope sample: 250 packages, 22 advisory instances (2 critical, 12 high, 7 medium, 1 low, 0 unknown). SaaS-scope sample: 250 packages, 5 advisory instances (4 high, 1 medium). Both inventories are capped, not complete. The SaaS sample excludes later packages and its zero critical count is not an assurance claim.

Separate exact-lockfile checks found Next.js 16.2.6 in both locks with 11 advisories per instance, including two critical advisories fixed at 16.3.3. Root PostCSS was 8.5.15 and SaaS PostCSS 8.5.20, not the declared range floor 8.4.31. Both had an advisory fixed at 8.5.23. Package presence is not proof of exploitability or compromise. This observation is bound to that old head; later dependency changes require fresh evidence.

The workflow uses Contents-read-only credentials and restricts requests to fixed GitHub repository reads and OSV queries. Evidence records commit, scanner/reader hashes, timestamps and limitations. It is not an authenticated application scan and does not overwrite stored reports. It now also runs for changes to root and SaaS package manifests/lockfiles. A successful collection is not security clearance.

## Integration

Current main b9ae4191e536f372308dbd7dec41665afa9aa8ee is preserved, including its independent SaaS Next.js 16.3.5 update and learning changes. ONBOARD blob 8977628013bb9306ad0c989f8baab88b616509e4 remains current. Full current-head CI, Preview, review and exact-merge Production are verified separately; this document does not substitute for those gates.
