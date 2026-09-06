# Builder explanation fidelity — 2026-09-06

The prior live job b6585c7f-601e-4092-9027-7009d1799b7c described an edit/search mismatch that never occurred. Its unsuccessful event was a blocked repeated npm test request. The explanation accepted model prose directly; the deterministic fallback also treated any unsuccessful run request as reproduced failure and appended unchecked model details.

The correction supplies host-derived event outcomes to both explanation generation and a separate evidence-review call. The reviewer must accept every factual draft/proposal claim against the source and recorded trace before release. A rejected, malformed or unavailable verdict preserves fallback text and recorded evidence. Proposal persistence occurs only after review. Initial narration remains inside the existing 35-second maximum and persistence reserve. No execution port, new authority, schema or model fallback is added.

Execution evidence labels blocked requests, timeouts and missing execution outcomes explicitly. Repair fallback requires an actual nonzero exit before describing a reproduced failure; unchecked model details are removed. The review is probabilistic semantic validation using the configured Builder model, not independent proof that every claim is true.

Mandatory regression coverage includes the original fabricated failed-edit draft, rejection in initial and follow-up modes, unavailable/malformed reviewers, proposal non-persistence on rejection, blocked/timeout/unconfirmed distinctions, real Node failure/edit/pass explanation, and the existing deadline with a stalled reviewer. Live acceptance must inspect the original job again without rerunning it, then a fresh repair and read-only follow-up.

Local validation: all 988 mandatory regressions and TypeScript passed. Exact Preview/CI, deployment and live observations remain pending.
