# Cyber live evidence initialization-failure repair

Review 3994588610 on PR #2144 identified that source reads, TypeScript stripping, import-alias validation and dynamic module loading occurred before the reporting try/finally. A module-load failure therefore produced no report artifact.

These operations now run inside the existing collection boundary, after the fixed read-only fetch guard is installed. The evidence envelope exists first, with null hashes until each source is successfully read. A failed load records the exact commit, timestamps, available source hashes and failure; finally restores fetch and writes report.json. Successful observations are unchanged. Repository/ref validation remains mandatory and no network, application, database or mutation authority is added.

Eight executable isolated subprocess tests cover additional runtime imports, TypeScript parse errors, changed reader aliases, unreadable sources, throwing reader initialization, out-of-scope initialization fetches, partial-observation preservation and success. Every child denies live network access and checks fetch restoration. Six fail and two pass on original script blob b1a37091f2f6574b4164dfa866c41c52976cb776; all eight pass after repair. Combined with the unchanged 28 scanner tests, all 36 focused tests pass with zero failures/skips. They are registered through the existing cybersecurityLiveProgress gate without removing any prior test. Local execution is a partial source assembly, not full CI or an authenticated Production scan.

Tested uploaded script: 2f5f80255786bf2399e11184abac82ac155bf136.
Tested uploaded regression file: c898b4a8dafb861cf35e27edef50d825dc64effd.
Scanner remains ec6d209178e6c32116bc99409b44f97bbc91939f.
Main was rechecked at 7481ee412abf0fd6ea4fd32572131cb521091b59.

The earlier e4dde9c head passed all eleven latest applicable workflows and Vercel Preview. Its independent review finished and raised this single additional failure-path issue. Those successes do not substitute for checks on this follow-up head. New-head checks, live evidence and review remain required before expected-head merge and exact-merge Production verification.
