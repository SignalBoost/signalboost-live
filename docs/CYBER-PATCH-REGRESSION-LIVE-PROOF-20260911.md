# Cyber patch regression and live evidence

Date: September 11, 2026 (America/New_York)

## Regression repair

Following PR #2142, concurrent scanner coverage changes removed applicable interval filtering and once again exposed every advisory fixed boundary as a proposed patch. The existing advisory-detail suite reproduces two failures on scanner blob ca244c28d7bdb9743a1e137d7b66c857c4191c64. Restoring the interval filter makes all nine unchanged tests pass. The repaired scanner blob is d107073c6de2954ce38755e113aa5fe6b4687a2c.

The latest manifest-size, inventory-coverage and unresolved-range changes remain intact. A range floor is not treated as an installed version. Fixed versions must be stable compatible upward boundaries of the interval containing the queried version; unrelated intervals remain descriptive evidence only. No approval fields, execution gates, installed dependencies, stored scans or University code are modified.

## Read-only live evidence

The Cyber Live Evidence workflow invokes the actual scanner and GitHub reader at the exact checked-out PR commit. It checks repository/root and SaaS scope with the existing 250-package cap, then checks the exact Next.js and PostCSS versions in both lockfiles. External calls are restricted to read-only repository APIs and OSV advisory queries. Its ephemeral token has Contents read only; credentials are not exported. No signed-in application endpoint, production database or model provider is used.

The artifact binds observation times, repository commit and scanner/reader blob hashes to results and limitations. Collection success is not a security clearance. Incomplete coverage, missing detail records and collection errors remain visible. GitHub Actions execution is not an authenticated Production scan, and a lockfile does not prove runtime reachability or exploitation.

Local verification used a partial source assembly, not a complete repository checkout. The unchanged nine-test suite passed after repair; the evidence loader also passed a separate mocked-transport smoke check, which is not live advisory proof. Live collection, full CI, Preview, review and exact-merge Production status are verified separately before claiming release completion.

Main was re-scanned at 123090930c15768825e65af47ee71446939e8d13; its corrected coverage tests are preserved. ONBOARD blob: 8977628013bb9306ad0c989f8baab88b616509e4.
