# Builder explanation fidelity — 2026-09-06

The prior live job b6585c7f-601e-4092-9027-7009d1799b7c described an edit/search mismatch that never occurred. Its unsuccessful event was a blocked repeated npm test request. The explanation accepted model prose directly; the deterministic fallback also treated any unsuccessful run request as reproduced failure and appended unchecked model details.

The correction supplies host-derived event outcomes to both explanation generation and a separate evidence-review call. The reviewer must accept every factual draft/proposal claim against the source and recorded trace before release. A rejected, malformed or unavailable verdict preserves fallback text and recorded evidence. Proposal persistence occurs only after review. Initial narration remains inside the existing 35-second maximum and persistence reserve. No execution port, new authority, schema or model fallback is added.

Execution evidence labels blocked requests, timeouts and missing execution outcomes explicitly. Repair fallback requires an actual nonzero exit before describing a reproduced failure; unchecked model details are removed. The review is probabilistic semantic validation using the configured Builder model, not independent proof that every claim is true.

Mandatory regression coverage includes the original fabricated failed-edit draft, rejection in initial and follow-up modes, unavailable/malformed reviewers, proposal non-persistence on rejection, blocked/timeout/unconfirmed distinctions, real Node failure/edit/pass explanation, and the existing deadline with a stalled reviewer. Live acceptance must inspect the original job again without rerunning it, then a fresh repair and read-only follow-up.

Local validation: all 993 mandatory regressions and TypeScript passed. Exact Preview/CI, deployment and live observations remain pending.

Integrated concurrent #1900 without changing its domain lookup. Review repair preserves pending chunk state through both workspace and repository public trace serializers; incomplete assembly cannot be narrated as a completed mutation.

## First live check and edit-delta correction

#1901 merged at 28e085ff81cbedb76e86bd02cb521d175b41d60e; Production dpl_CQV9qkeJmUHTYywkz7uTvQma3Tq8 READY. Exact head f06cefb6a0ac5e06ae979b882c8bb85d7f9e7308 passed ten CI workflows and Preview dpl_2Gx7Z5DLh8ydqK2wvUmqQyZqk59q. All 993 regressions and TypeScript passed.

The read-only original-job explanation correctly reported two completed npm test commands, the blocked duplicate, and no failed source edit. It incorrectly said three tests were added: the recorded replacement retained one existing test and appended two. Runtime review returned supported=true. Therefore this first observation does not accept complete explanation fidelity.

The follow-through derives a contiguous edit delta by removing identical leading/trailing lines from complete search/replace evidence. Initial generation and review receive that delta instead of an ambiguous replacement block. Truncated or missing historical changes are explicitly incomplete. Interior lines can still be unchanged, so the review must compare both sides and omit unsupported counts rather than infer semantic additions from raw line counts. This is a general evidence representation correction, not a hardcoded test-name or numerical-output patch.

## Second live check and causal distinction

#1902 merge fc4cbdbea82ae7dd856de7643fd52ee79429f890; Production dpl_G8pWtcaEFrb8k6FfVYfNfHzwgE8J READY. All 994 regressions and TypeScript passed; exact head 79ca17ced8e6890fdc222cbf0be9546dc1b04b1d passed ten CI workflows and Preview dpl_9S1XTRDBH4wNsrFGJfMJZ9RTAZ1D.

Repeating the same original-job question correctly reported two added tests, two completed npm test runs, a blocked duplicate request and no failed source edit. Review returned supported=true.

Fresh repair e22206f9-7008-41c5-aba7-5f0bb880e691 added assertions for signed 1.00499999999999999 amounts. The old suite passed; after adding assertions, npm test failed 101 !== 100 before any money.js edit. Removing EPSILON then broke existing ties. Later string-parsing edits passed fourteen tests. The initial semantic review returned supported=false and the user received deterministic evidence instead of unchecked prose. The rejected draft is not persisted, so its precise rejected claim is unknown.

A read-only follow-up described the concrete edits and checks but incorrectly said the test addition introduced the failure rather than a pre-existing money.js bug. This conflates first observed failure with origin. The next correction explicitly requires generation and review to reject that inference: a previously passing suite cannot establish absence of an untested defect; source, requirement and assertion evidence must establish the causal distinction. Live acceptance remains pending.

The precision candidate is retained as docs/fixtures/builder-rounding/precision-money.cjs. Removing the two added assertion lines reproduces the prior test file byte-for-byte. The unchanged independent probe passed all 10,102 cases, and both supplied long-decimal regressions returned the requested cents. A separate compatibility check found a remaining regression: numeric 12.5 throws value.startsWith is not a function, whereas the preceding implementation accepted numbers. Builder must repair this before accepting preservation of the public input contract.

Local causal-distinction validation: all 995 mandatory regressions and TypeScript passed.

Review repair: follow-up generation and review now receive the original persisted job requirement, bounded to 8,000 characters with truncation marked. The scoped evidence lookup already retrieves this field. Without it, a follow-up question alone could not distinguish requested behavior changes from existing defects. No lookup or authorization scope changes.
