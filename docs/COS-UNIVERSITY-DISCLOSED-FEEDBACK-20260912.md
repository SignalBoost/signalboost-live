# University feedback requires recorded disclosure

Follow-up to PR #2150 review 3995315743. This supersedes the original length-feedback eligibility described in COS-UNIVERSITY-RESPONSE-FEEDBACK-20260912.md; the public examination response contract itself is unchanged.

## Defect and evidence

The original adapter required a genuine failed agent-bound examination but did not verify that the learner received a response limit. A read-only Production query confirmed the documented Specialist examination has an authoritative failed assessment and no responseContract. Such a historical outcome cannot establish disobedience of a stated limit.

## Corrected boundary

The host adapter now reads the exact same-agent, same-run failed assessment through its canonical assessment key and source reference. Independent scoring and host_private_exam authority are required both in the query and the pure decision. Only the public responseContract JSON member is selected from assessment evidence; private cases, answers and criteria are not retrieved by this added read. The planner still receives only fixed categories.

Targeted response-length coaching requires university_response_contract_v1, a positive safe-integer ceiling, whitespace_separated_tokens counting and entire_final_response scope. A matching historical assessment without a contract supplies a separate undisclosed_response_length category, which cannot add coaching. Missing, malformed, mismatched, future or unavailable proof supplies no feedback and cannot erase previously supported guidance.

When the historical category is established, the helper removes only the exact previously generated coaching suffix. The unchanged planner persists that correction only for queued/studying plans behind exact agent, source-exam, old-objective and status guards. Study proofs, attempts, remediation fences, status, grades, examinations and credentials are not rewritten. Ready/terminal/concurrently advanced plans remain untouched. New examinations still disclose and enforce their existing limits and still require independent success.

## Executed checks and release boundary

The new standalone suite executes the real pure decision and the actual runtime adapter through isolated database ports. Against exact baseline blobs 007f578a954648df3bb2b71c5dfb4b0da181a93d and dcc49fecd76635d4927c70f46fcd97318c26f36a: 2 passed, 26 failed. Against the correction, the identical suite reports 28 passed, zero failed or skipped. Node v22.16.0 type-stripped syntax checks and strict standalone TypeScript checking of the pure helper pass.

Existing positive fixtures now include correctly scoped disclosure proof rather than implying a missing contract is valid. All existing assertion purposes remain. Two actual-planner regressions cover legacy cleanup without state loss and refusal to modify ready/terminal/concurrent plans. The existing mandatory feedback importer loads the new standalone suite, so no Vercel gate or old test is removed. Full current-head CI and Preview must validate this complete registration and planner integration before merge.

Local testing is a focused source assembly, not a complete checkout; direct GitHub DNS resolution was unavailable. Both modified production baselines and the existing test baseline were checked against Git blob hashes; uploaded modified code/test blobs match local bytes. No database migration, direct Production data mutation, fabricated outcome, manual retest, inference call, provider change or authority expansion was performed. Exact merge deployment and genuine runtime correction must be verified separately.
