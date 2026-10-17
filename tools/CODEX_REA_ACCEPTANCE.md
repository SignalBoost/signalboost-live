# Native Codex REA acceptance harness

This is an isolated A/B test using the actual OpenAI Codex agent runtime, not another replica of the Builder V2 tool loop. It does not replace the production Builder worker or silently send customer data to OpenAI.

Sources reviewed:
- https://github.com/openai/codex (Apache-2.0)
- https://github.com/openai/codex/blob/main/sdk/typescript/src/codex.ts (thread/resume API)
- https://developers.openai.com/blog/codex-as-a-platform
- https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex

Run in an isolated worker where the **official Codex CLI is installed and authenticated**:

```sh
node tools/codex-orderflow-acceptance.mjs /path/to/orderflow-spec.md /tmp/orderflow-workspace /tmp/orderflow-evidence
```

The runner invokes `codex exec --json --sandbox workspace-write`, stores the event stream, and independently runs the three mandatory Node commands. It persists stdout/stderr, real exit codes, an acceptance JSON record, and SHA-256 file hashes. A missing CLI, failed test, missing file, or timeout results in INCOMPLETE, not PASS.

No production deployment, real Codex execution, or successful Builder acceptance is claimed. Integration into Builder V2's authenticated sandbox worker, durable job lifecycle, cancellation, tenant isolation, and metering is still required.
