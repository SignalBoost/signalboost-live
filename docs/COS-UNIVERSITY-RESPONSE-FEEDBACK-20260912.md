# University cycle acceptance and public response-constraint feedback

## Production execution now observed

Read-only Supabase verification on September 12, 2026 at 05:14–05:16 UTC linked:

- Remediation plan `29998dad-519b-4ae4-b8aa-4fa2e02445f9`, Software Specialist, study attempt 3.
- Acquisition `45252ca6-5c5e-420c-a737-5332c70b97de` completed at 04:32:41.272 UTC with one admitted content hash.
- The learner's own practice runs `085dd465-9f3c-4d22-b86b-578fe8d2a3d3` and `94d849e7-2a6d-475a-9279-0c1b73ba1682` both passed and carried the same exact source hash and acquisition/plan/attempt binding.
- Its own fresh independent retest `cac380db-e46f-4435-bafc-e84aab2d1219` completed at 04:47:10.776 UTC and failed with `word_limit_exceeded`.
- The old plan was superseded and new same-agent remediation `0a727016-fc13-4ff8-8cc1-9ccf3f172bb4` was queued by 05:02:05.419 UTC with the exact failed-exam reference.

This verifies the automatic study -> source delivery -> own practice -> independent retest ->
failure/remediation path, including fresh identities across deployments. It is NOT a passing
independent exam, proof of permanent learning, an A grade, or graduation. The word-limit failure
is retained and must not be hidden by trimming/rescoring an answer or weakening the limit.

## Root cause correction: the response ceiling was undisclosed

The history exam enforced a 260-word maximum but its learner-facing prompt did not state a word
limit. The existing independent runner passed only that prompt to the Specialist. The recorded
length failure is therefore NOT proof that the learner ignored a stated instruction.

A host-controlled execution projection now appends the existing numeric ceiling and the scorer's
whitespace-token counting convention to the prompt for BOTH COS and Specialist examinations.
The ceiling is localized in all five supported languages. Only the public output constraint is
projected: expected concepts, forbidden answer terms, private criteria and scoring instructions
remain isolated. Invalid constraints fail before inference; absent constraints leave input alone.
The existing case/rubric/manifest objects and scoring code are unchanged, so historical records do
not drift. The bound executor hashes the actual augmented prompt, and each newly recorded
assessment carries the explicit response-contract version, ceiling, counting rule and scope.

The old failure remains in the ledger without silent trimming, rescoring or fabricated credit.
Only a fresh correctly specified examination can establish performance under the disclosed limit.

## Remaining teaching gap and repair

The new plan contained only the generic subject objective. The planner intentionally did not read
raw scorer reasons. Preserve that isolation while a separate host-only read projects exactly one
response-length failure into the fixed category `response_length`.

The projection checks exact agent/run identity, terminal failed status, genuine execution flags,
source ownership and completion time. Unknown, malformed, private-concept or instruction-like tags
are not forwarded. The feedback adapter reads no case, rubric, required concepts, numeric limits, answer, or other
hidden examination content. Numeric response limits are disclosed separately by the executor. A read failure yields no targeted feedback, not invented evidence.

The original subject objective gets additive non-credit guidance on budgeting, counting and
revising concise answers without losing facts or uncertainty. That objective feeds the existing
study and practice paths. Existing queued/studying objectives are refreshed with exact agent,
source-exam and old-objective guards. No status, study count, accepted-source proof, remediation
boundary, score or credential is changed. Ready/completed/superseded objectives are not rewritten.
This is training guidance, not a new scored practice gate or a demonstrated improvement in results.

## Verification boundary

The exact baseline planner blob `3934153e62fc5aba5bb504b59619883af0efb38f` was reconstructed and
verified before editing. The same actual persistence-function tests fail on the baseline for new
and existing length-remediation plans, then pass on the repair. Nine focused regressions cover
identity/provenance isolation, safe projection, idempotency, real planner insertion/update paths,
state preservation and concurrent readiness. All pass locally with injected I/O; no live model or
database is used by those tests. The existing mandatory post-remediation test imports the suite;
its five original test bodies remain unchanged. Full CI and Preview remain separate release gates.

Seven additional response-contract tests exercise the actual unchanged scorer and actual COS and
Specialist execution functions with injected I/O. The identical baseline proof has three failures
(missing disclosure on both paths and invalid-constraint execution); the repair passes all seven.
Together with the nine feedback tests, all 16 pass locally, zero failed/skipped. The independent
runner baseline was reconstructed byte-identically to blob 82dec69c686b06e99652746a1ed560869f66cc34.

No migration, direct Production data edit, scorer change, acceptance-threshold relaxation, external
inference provider or added authority is introduced. Learner-facing exam input intentionally gains
the formerly undisclosed limit; it is no longer claimed byte-equivalent. Fresh CI/Preview and a
subsequent independent retest remain necessary for release and performance acceptance.
