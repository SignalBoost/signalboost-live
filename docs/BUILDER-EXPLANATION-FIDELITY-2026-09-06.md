# Builder explanation fidelity — 2026-09-06

The prior live job b6585c7f-601e-4092-9027-7009d1799b7c described an edit/search mismatch that never occurred. Its unsuccessful event was a blocked repeated npm test request. The explanation accepted model prose directly; the deterministic fallback also treated any unsuccessful run request as reproduced failure and appended unchecked model details.

The correction supplies host-derived event outcomes to both explanation generation and a separate evidence-review call. The reviewer must accept every factual draft/proposal claim against the source and recorded trace before release. A rejected, malformed or unavailable verdict preserves fallback text and recorded evidence. Proposal persistence occurs only after review. Initial narration remains inside the existing 35-second maximum and persistence reserve. No execution port, new authority, schema or model fallback is added.

Execution evidence labels blocked requests, timeouts and missing execution outcomes explicitly. Repair fallback requires an actual nonzero exit before describing a reproduced failure; unchecked model details are removed. The review is probabilistic semantic validation using the configured Builder model, not independent proof that every claim is true.

Mandatory regression coverage includes the original fabricated failed-edit draft, rejection in initial and follow-up modes, unavailable/malformed reviewers, proposal non-persistence on rejection, blocked/timeout/unconfirmed distinctions, real Node failure/edit/pass explanation, and the existing deadline with a stalled reviewer. Live acceptance must inspect the original job again without rerunning it, then a fresh repair and read-only follow-up.

Initial local validation: all 993 mandatory regressions and TypeScript passed. Subsequent deployment and live observations are recorded below.

Integrated concurrent #1900 without changing its domain lookup. Review repair preserves pending chunk state through both workspace and repository public trace serializers; incomplete assembly cannot be narrated as a completed mutation.

## First live check and edit-delta correction

#1901 merged at 28e085ff81cbedb76e86bd02cb521d175b41d60e; Production dpl_CQV9qkeJmUHTYywkz7uTvQma3Tq8 READY. Exact head f06cefb6a0ac5e06ae979b882c8bb85d7f9e7308 passed ten CI workflows and Preview dpl_2Gx7Z5DLh8ydqK2wvUmqQyZqk59q. All 993 regressions and TypeScript passed.

The read-only original-job explanation correctly reported two completed npm test commands, the blocked duplicate, and no failed source edit. It incorrectly said three tests were added: the recorded replacement retained one existing test and appended two. Runtime review returned supported=true. Therefore this first observation does not accept complete explanation fidelity.

The follow-through derives a contiguous edit delta by removing identical leading/trailing lines from complete search/replace evidence. Initial generation and review receive that delta instead of an ambiguous replacement block. Truncated or missing historical changes are explicitly incomplete. Interior lines can still be unchanged, so the review must compare both sides and omit unsupported counts rather than infer semantic additions from raw line counts. This is a general evidence representation correction, not a hardcoded test-name or numerical-output patch.

## Second live check and causal distinction

#1902 merge fc4cbdbea82ae7dd856de7643fd52ee79429f890; Production dpl_G8pWtcaEFrb8k6FfVYfNfHzwgE8J READY. All 994 regressions and TypeScript passed; exact head 79ca17ced8e6890fdc222cbf0be9546dc1b04b1d passed ten CI workflows and Preview dpl_9S1XTRDBH4wNsrFGJfMJZ9RTAZ1D.

Repeating the same original-job question correctly reported two added tests, two completed npm test runs, a blocked duplicate request and no failed source edit. Review returned supported=true.

Fresh repair e22206f9-7008-41c5-aba7-5f0bb880e691 added assertions for signed 1.00499999999999999 amounts. The old suite passed; after adding assertions, npm test failed 101 !== 100 before any money.js edit. Removing EPSILON then broke existing ties. Later string-parsing edits passed fourteen tests. The initial semantic review returned supported=false and the user received deterministic evidence instead of unchecked prose. The rejected draft is not persisted, so its precise rejected claim is unknown.

A read-only follow-up described the concrete edits and checks but incorrectly said the test addition introduced the failure rather than a pre-existing money.js bug. This conflates first observed failure with origin. The next correction explicitly requires generation and review to reject that inference: a previously passing suite cannot establish absence of an untested defect; source, requirement and assertion evidence must establish the causal distinction. The subsequent acceptance attempt and review recovery are recorded below.

The precision candidate is retained as docs/fixtures/builder-rounding/precision-money.cjs. Removing the two added assertion lines reproduces the prior test file byte-for-byte. The unchanged independent probe passed all 10,102 cases, and both supplied long-decimal regressions returned the requested cents. A separate compatibility check found a remaining regression: numeric 12.5 throws value.startsWith is not a function, whereas the preceding implementation accepted numbers. The subsequent numeric compatibility repair is recorded below.

Local causal-distinction validation: all 995 mandatory regressions and TypeScript passed.

Review repair: follow-up generation and review now receive the original persisted job requirement, bounded to 8,000 characters with truncation marked. The scoped evidence lookup already retrieves this field. Without it, a follow-up question alone could not distinguish requested behavior changes from existing defects. No lookup or authorization scope changes.

## Review recovery and numeric compatibility

#1904 merged at 6ad1029d7d473a97e7e7db1ed3a895b17a7d7d5c and deployed READY as dpl_3NWgZK4t8GsKZz4CmvoeKXNGrYjA. All 1001 mandatory tests and TypeScript passed; exact head 25592f9ce53e6ca5370dd0e64a40aec8ae867087 passed ten CI workflows and Preview dpl_Cm9Y8UvY5eQ7yf9kQo4B19QqGw4B. The repeated causal follow-up withheld prose and retained raw evidence, so useful explanation acceptance was still incomplete.

Numeric repair job 1f981431-e1d5-47b3-b22f-29c58ce23037 added one test block containing four assertions. Its first npm test failed on value.startsWith for a numeric input before money.js changed. Converting the validated input with String(value) fixed that TypeError, but the next run failed because the small-exponent input returned a fractional cent. Wrapping the final result with Math.round then passed all fifteen tests. The fourteen pre-existing tests/assertions were preserved byte-for-byte after removing only the new block. The exact source is numeric-money.cjs in the rounding fixture directory; the unchanged independent probe passed all 10,102 cases and six focused numeric/long-decimal checks passed. These finite checks do not establish correctness for all magnitudes or numeric formats.

Both the numeric repair's initial answer and its read-only follow-up returned safe evidence without a useful model explanation. The correction permits the reviewer to supply one supported rewritten answer after rejecting a draft, then independently reviews that replacement against identical source, trace, events and original requirement. No unchecked replacement is released; there is no recursive retry. Rejected proposal requests cannot use this recovery to save an objective. The existing initial explanation deadline also covers recovery. Review remains probabilistic, and a rejection alone does not prove the original draft was wrong because rejected prose is not persisted.

Local recovery validation: 36 focused tests and all 1005 mandatory tests passed. TypeScript passed. #1905 exact head 26e44dec51c86cde19fc8d084be32200674b7f19 passed all ten CI workflows and Preview dpl_FNBPJW5AQpbrAeHnCE87ZxwaK45X, with no unresolved review threads. It merged at 2901eb6abcde981ebc309b4dc2045436a5600899; Production dpl_G4h1WxfWxtGUPUaHowc1QJTFUeUn was verified READY at that exact merge SHA.


## Final observations on the deployed recovery change

The same numeric follow-up now returned a useful supported explanation: it identified direct string-method calls on numbers, String(value), the small-exponent fractional result, the final Math.round change, the two failed npm test runs and the final fifteen passing tests. It limited the conclusion to those tests. Runtime review returned supported=true on the first review, so this observation does not prove the correction branch ran in Production. Regression tests exercise accepted/rejected correction, bounded retries, deadline and proposal boundaries. The scoped latest-job query remained 1f981431-e1d5-47b3-b22f-29c58ce23037; no code was rerun or job created by the explanation.

A second read-only question explicitly targeted older precision job e22206f9-7008-41c5-aba7-5f0bb880e691 and asked to distinguish historical evidence from current files. It correctly said the new assertions exposed the existing defect and described the baseline/failure/final passing sequence. It nevertheless claimed that current files matched that job's final state. They do not: the later numeric repair added String(value), Math.round and the numeric test block. The answer also described the non-zero remainder test as occurring after the third digit, while the recorded source uses fraction.slice(2), including that digit. The review accepted the answer. Therefore this historical explanation is NOT accepted as fully faithful, and neither the guard nor this finite sample proves universal reasoning accuracy.

Remaining work: persist source snapshots or verified version identity tied to each job, expose actual current-versus-historical comparisons, and verify the historical explanation against that evidence. Do not call the complete harness or all explanation paths certified. The fresh numeric repair and useful numeric follow-up are observed; a newly executed initial explanation after #1905 and a Production correction-branch observation remain unverified.


Follow-through: #1907 now stores bounded runner-input snapshots and full-content fingerprints. Live current-versus-older-job comparison and legacy unavailable-identity handling are recorded in BUILDER-SOURCE-HISTORY-2026-09-06.md. The source-identity gap is addressed for newly captured runs; broad legacy narration and task/conversation routing limitations remain explicitly open there.
