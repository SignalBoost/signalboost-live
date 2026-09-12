# Dependency release-gate repair

Follow-on evidence for PR #2146 and CYBER-DEPENDENCY-REPAIR-20260912.md.

Vercel Preview dpl_EEjSh2U9zEUqHZuPQaVz1TnPHb7D on head 7fba61f
ran 1,585 deployment tests: 1,584 passed and one failed. The failure in
cyberDependencyScanCoverage.node.test.ts assumed the current PostCSS range floor
must differ from its installed version. Raising the required patched minimum
legitimately made both 8.5.23 in SaaS; the assertion was about incidental current
data, not scanner correctness. Deployment correctly stopped.

The replacement retains repository range/locked-version and pinned Next.js
checks, and every existing manifest-read, coverage, range rejection and missing
lockfile assertion. Three deterministic executable fixtures load the real scanner
through the same TypeScript/injected-port pattern as existing advisory tests:

- Historical ^8.4.31 with installed 8.5.23 queries only the locked version and
  records package-lock.json as its authority.
- Equal-floor ^8.5.23 with installed 8.5.23 also derives authority from the lock,
  never by stripping the declared range.
- The same range without a lockfile makes no PostCSS query, remains unresolved,
  and explicitly makes coverage incomplete.

Every external boundary is injected. The fetch port accepts only the expected
OSV batch request and returns empty advisory results; fixtures perform no live
network access. These are inventory/coverage tests, not live vulnerability proof.
No scanner implementation, dependency blob, threshold or release gate changes.
The test is already part of the mandatory Vercel deployment suite.

Latest main 12dc7c1a46df696b423cae9660e75025234140cb adds a University supply
priority test. It is integrated byte-for-byte as blob
20641af9d33a8e9ca8fb7290c042e9723b6c64bf; earlier University changes remain intact.
The serialization token is refreshed to that base. Current-head CI, Preview,
independent review and expected-head merge remain required; no Production repair
is claimed by this handoff.
