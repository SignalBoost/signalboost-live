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
