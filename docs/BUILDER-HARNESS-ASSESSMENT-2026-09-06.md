# Builder harness assessment — 2026-09-06

Scanned main `b90560d4dd92b85071eeeca94b8c9ec1945fd555` after #1888 and #1892, including current ONBOARD, durable runner, tool loop, working context, lesson store, regression gates and dated live results. This is an implementation/evidence assessment, not a universal capability score.

| Capability | Established foundation | Remaining evidence or functionality |
| --- | --- | --- |
| Project context | Supplied multi-file projects, bounded current source, pinned public import; live repair and import records | Wider repository/history access and arbitrary project scale are not accepted |
| Inference and guidance | Live source-based diagnosis, explanation, Q&A and proposals; prompt requires hypotheses and evidence | General transfer of learned procedures to unfamiliar problems is unproven; durable runner disconnected from repair lessons |
| Execution | File assembly/editing, declared npm installation, sandbox commands; live examples | Supported runtimes, network/package policies and budgets remain bounded |
| Verification | Fresh requested-command gates and fail/change/pass repair; live examples | Passing tests do not establish arbitrary requirements or independent quality improvement |
| Continuity | Same-project follow-ups, saved proposal approval; checkpoints and generation fencing | Mid-task steering, cancellation and live interrupted-job recovery need separate assessment/acceptance |
| Control | User/workspace boundaries, restricted egress, fenced claims, no implicit private repository authority | Expansion must preserve these contracts and independently establish recovery behavior |

## First concrete repair: reconnect project repair history

The standard durable runner supplied `priorLessons: []` on every invocation and never called the existing repair lesson writer. The separate repository runner already used that mechanism. Read-only Production inspection of the accepted expense-report workspace returned zero stored repair lessons despite its documented repairs.

The correction reads at most twelve same-user/same-workspace repair signals from the existing service-only table. It selects only failure class and runtime; raw historical source, error text, commands, model summaries and private COS corpus never reach the model. The existing formatter supplies a count-only hint after a matching current failure. This restores a bounded history signal, not learned procedural content or proof that inference improved.

New lesson admission requires a real non-timeout failed command, a subsequent source change and the same command passing after the last change. A later contradictory rerun rejects admission. Summaries are deterministic evidence descriptions rather than model-written causal claims. Persistence checks the successful standard job's exact user, workspace and claim generation; the job UUID makes repeat writes idempotent. Writes happen after terminal job persistence and cannot turn a successful task into a failure. Reads/writes are bounded, best effort; no migration or authority expansion.

Regression coverage includes real Node fail/change/pass across a serialized checkpoint, exact PostgREST ownership/runtime/generation filters, duplicate-safe writes, stale-worker rejection, and model prompts receiving the hint only after their own matching failure. All 977 mandatory regressions and TypeScript passed locally. The exact Preview and ten CI workflows passed before #1893 merged; live connection evidence follows.

## Live result and limitations

Application merge `8f22b3ab3e109eef1beee26566c4d3aa14b8b6ba`; Production `dpl_DmUYTJ3aMsY14iRXpMGQBEqsG4L8` READY. Both requests used the existing expense-report conversation/workspace `1ce11289-af83-4d6a-9baa-bb79fa2d15a8` without upload.

Job `e45b0e19-342b-41fb-99f3-1ee7d43e9d2c` added an assertion that a posted constructor category with amount 5.00 produces an own property equal to 500. npm test reproduced an inherited Object constructor function being concatenated with 500 (ten pass, one fail). Builder changed the accumulator to Object.create(null) with an own-property check, then passed all eleven tests and explained the actual cause. The lesson table contained exactly one row with that job ID and npm test as its proof command. Runtime telemetry reported recorded=true, retrievedSignals=0.

Follow-up `2432fd49-9eb1-4158-802f-b75e39302782` requested decimal-string rounding of 1.005 to 101 cents and -1.005 to -101, preserving eleven old tests. It retrieved one project signal. It ran the old tests, added the two assertions in one test, changed money.js before reproducing that new test, and subsequently observed multiple failures before passing all twelve tests. Its final expression was Math.sign(cents) * Math.round(Math.abs(cents) + Number.EPSILON * Math.abs(cents) + 0.0001). Runtime telemetry reported recorded=true, retrievedSignals=1; scoped database inspection confirmed two lesson rows total.

Acceptance is limited to durable same-project repair-signal persistence/retrieval and fresh post-failure verification. The second job's requested new-test-before-first-source-edit order was not honored; the eventual failed-run/change/pass sequence qualifies as repair of its own failed implementation. The ad hoc numeric adjustment and narrow assertions do not establish correct general decimal rounding or preservation of every previously untested input. No inference improvement can be attributed to a count-only history signal from this uncontrolled sample. Do not present this as mastery, causal learning benefit or full harness completion. These are next engineering gaps, not reasons to inflate the accepted scope.

## Inference acceptance boundary

Inference must apply relevant knowledge to unfamiliar tasks, select useful checks and revise conclusions from contradictory results. A repair-history count cannot establish this. Connecting governed, validated procedural content to authorized inference and measuring transfer on materially different tasks remains a separate gap. Owner-fed private knowledge must not be copied into public Builder context to make a demonstration pass. Engineering owns the implementation and evaluation; the owner judges the completed experience.

## Verification-order and generalization follow-through

The next correction implements a deterministic gate for explicit `run COMMAND before changing FILE` instructions (also execute/editing/modifying/updating/patching/rewriting variants). When the request includes adding tests/assertions, the command must execute after the latest test-file mutation. An old passing baseline, a timed-out run or an unexecuted command cannot authorize that source edit. Matching write/edit attempts are rejected before workspace mutation; the trace-derived gate survives checkpoint serialization. It does not infer every possible natural-language ordering, enforce arbitrary dependencies between files, or prove the semantic quality of a test merely because a test file changed.

The reasoning prompt additionally asks Builder to derive boundary/counterexample tests beyond literal examples, implement the general rule and avoid arbitrary numerical tolerances. This is guidance, not a deterministic proof of generalization. A separate engineering probe uses BigInt decimal arithmetic to check 10,102 signed decimal cases, including nearby values around ties. It is held outside the live workspace during generation; it is not model-generated evidence or private cognitive certification.

The exact saved money.js from job 2432fd49-9eb1-4158-802f-b75e39302782 is retained as `docs/fixtures/builder-rounding/observed-money.cjs`. Before correction, the independent probe failed 30 cases; for example 0.0049999 yielded 1 cent instead of 0 and 0.0149999 yielded 2 instead of 1, with matching negative failures. Run the probe with NODE_PATH pointing at the installed saas/node_modules and pass the candidate module path. The original six-file expense fixture remains unchanged. All 981 mandatory regressions and TypeScript passed locally. Post-deployment live correction and independent candidate results remain pending.
