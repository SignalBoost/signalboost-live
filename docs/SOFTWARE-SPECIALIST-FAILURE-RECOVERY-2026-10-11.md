# Software Specialist failure recovery — 2026-10-11

Execution exceptions return an actionable chat response instead of a generic authorization block. Owner harness diagnostics include the actual failure code and run id. Cancellation remains a harness outcome.

Admission and Builder prompts use bounded failure excerpts. Repository targeting still parses the original log so the exact failed branch, commit, paths and import errors are preserved.

Delegation allows up to 180 seconds, constrained by the existing parent's limits and absolute deadline. Repair execution stays in durable background jobs. A missing parent capability remains denied; a child must never recreate a broader parent manifest.

Only an audit-store failure known to occur before execution retries once. Timeout, cancellation, verification failures, and uncertain queued jobs never replay. Users are directed to History before retrying.

Existing owner-only repair, isolated workspace, publication and merge/deployment authority controls remain enforced. The saved Builder proposal flow is not a repository merge approval mechanism.

Validation: 11 focused Node tests passed, including authorized shorter-parent delegation, missing-capability denial, execution attribution, long-log snapshot retention and retry boundaries. TypeScript syntax checked. Production execution has not been verified by this change.
