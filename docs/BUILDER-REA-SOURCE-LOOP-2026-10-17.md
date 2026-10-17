# Builder V2 orchestration REA — source-level integration batch

## Reference implementations and boundaries

- **OpenAI Codex CLI**: [public execution protocol](https://github.com/openai/codex/blob/main/codex-rs/docs/protocol_v1.md) documents Session → Task → Turn, tool dispatch, interrupts, and model retry limits. iTMounts adaptation: host-owned acceptance and command receipts, checkpointed turns, bounded model fallback and no duplicate resumed proof.
- **SWE-agent**: [agent implementation](https://github.com/SWE-agent/SWE-agent/blob/main/sweagent/agent/agents.py) implements action/observation cycles, timeout handling, trajectories, and bounded recovery attempts. iTMounts adaptation: preserve failing action evidence across claims, gate repeated no-change commands, and ensure the checkpoint resumes from the last meaningful state.
- **Cline and Aider**: additional architecture references for tool supervision and test-driven patching, not code imported in this batch.

No third-party source code has been copied. This is **behavioral source-level adaptation**, not a wholesale port of Codex, Cline, Aider, or SWE-agent.

## iTMounts production execution path

1. COS/Builder intake creates one durable, user-scoped job and workspace.
2. Worker claims one fenced job generation; older claims cannot overwrite its checkpoint.
3. Builder V2 parses the objective into required files, commands, and minimum passing test count.
4. Coding model proposes structured actions. The host dispatcher validates and executes file mutations, inspections and shell/test commands.
5. Host verification executes only missing commands after the latest source change. Failed commands are not re-run until a code edit; failure receipts remain accessible to the model.
6. Checkpoint stores revision, receipts and failure diagnostics; a resumed claim reconstructs the same revision-bound acceptance state.
7. If host receipts already prove all required commands after the latest change, the agent terminates **without another model call**.
8. Any absent test, failing command, cancelled claim, out-of-budget inference, or incomplete file list remains a failure, never claimed as success.
9. Final user-visible completion requires the worker to commit a terminal verified result.

## Verification and product acceptance

The test `saas/tests/builderV2OrderFlowScripted.node.test.ts` runs a real Node application and asserts a failed test → targeted edit → full passing host commands. The extended test also reopens a verified checkpoint with a deliberately unavailable provider; it must finish with zero further model calls and zero duplicate test runs.

This regression establishes properties of the controlled scripted reference workflow, **not** that unmodified live frontier coding models can complete arbitrary customer applications. The previously stopped production OrderFlow jobs must remain stopped. Product-ready acceptance still requires a separate new, explicitly authorized real-LLM OrderFlow run under a cost/time ceiling with real user-facing artifacts.

## Direct source audit (not marketing feature comparison)

Sources inspected in upstream source trees:

1. SWE-agent `sweagent/agent/agents.py` — `DefaultAgent.step` calls `forward_with_handling`, appends an action/observation to both history and a persisted trajectory. `RetryAgent.run` loops on real `step_output.done`, saves trajectory after every step, and has a separate review submission/retry loop. See https://github.com/SWE-agent/SWE-agent/blob/main/sweagent/agent/agents.py
2. Aider `aider/coders/base_coder.py` — `run_one` sends a message and uses bounded `reflected_message` repairs under `max_reflections`; `auto_commit` commits edited files with context. See https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py
3. Codex CLI `codex-rs/core/src/session/turn.rs` — `run_turn` owns the model/tool follow-up loop; tool calls produce results for subsequent sampling, whereas an ordinary assistant message may end the turn. `tasks/regular.rs` owns cancellation and the regular task lifecycle; `unified_exec/mod.rs` separates sandbox policy and execution. See https://github.com/openai/codex/tree/main/codex-rs/core/src
4. Cline — implementation layout and task/tool flow require additional exact-revision source verification before claiming full REA. No Cline source port is claimed.

### Concrete architecture gaps in iTMounts

- **Persistent trajectory versus receipts**: V2 stores receipts but no independent reviewer judging repair quality; latest error context and revised command proof are now reconstructed, but reviewer integration is unimplemented.
- **Bounded reflection and strategy switch**: Aider caps reflections and SWE-agent has a reviewer/retry strategy; V2 caps attempts and tool receipts, but no independent debugger strategy switch is demonstrated.
- **Lifecycle control**: Codex documents explicit interrupt, cancellation and terminal task state; iTMounts has durable job status but lacked user-visible stop control, as shown when stopping the two OrderFlow jobs required direct database intervention.
- **Host execution**: iTMounts has execution evidence and sandbox tools. Actual completed proofs should terminate without further model calls; this PR modifies that boundary.
- **Live acceptance**: Scripted agent tests are insufficient to establish live autonomous correction of a wrong `createCatalog` export. This remains an unresolved acceptance gate.

This is a **source audit with identified implementation gaps**, not a claim of an end-to-end reverse engineering of Codex/Cline/SWE-agent or a production-ready Builder.
