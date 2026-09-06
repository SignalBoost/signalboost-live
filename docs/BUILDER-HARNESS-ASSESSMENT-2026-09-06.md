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

Regression coverage includes real Node fail/change/pass across a serialized checkpoint, exact PostgREST ownership/runtime/generation filters, duplicate-safe writes, stale-worker rejection, and model prompts receiving the hint only after their own matching failure. All 977 mandatory regressions and TypeScript passed locally. Live post-deployment persistence and follow-up retrieval remain pending.

## Inference acceptance boundary

Inference must apply relevant knowledge to unfamiliar tasks, select useful checks and revise conclusions from contradictory results. A repair-history count cannot establish this. Connecting governed, validated procedural content to authorized inference and measuring transfer on materially different tasks remains a separate gap. Owner-fed private knowledge must not be copied into public Builder context to make a demonstration pass. Engineering owns the implementation and evaluation; the owner judges the completed experience.
