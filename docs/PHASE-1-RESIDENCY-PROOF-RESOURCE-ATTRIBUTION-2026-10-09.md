# Residency proof resource attribution

The 2026-10-09 07:20 UTC Step 1 production report on `cab510a0748516372e754fa75cf79749c2aedbd3`
records one `residency_proof_exit_137` among seven-day Residency failures.
Source: https://github.com/SignalBoost/signalboost-live/actions/runs/37898333718

The live executor classified every nonzero independent-proof exit as a competency
failure. Exit 137 is a killed/resource-exhausted execution, which cannot establish
a completed competency verdict. Its precise cause (for example, OOM versus an
external kill) is not established by that exit code.

The repair preserves the proof evidence and failure code and routes exit 137 as
an infrastructure fault through the existing Harness. Assertion exit 1 remains
a competency failure; success still requires exit 0 without timeout. Existing
retry, spend, authority, exam and graduation limits remain in force. No historical
case or competency ledger is rewritten.

Validation: four executable proof/Harness tests pass locally, including actual
SIGKILL and assertion subprocesses. The old classification fails both resource
tests. Live-executor regressions cover a successful resident loop followed by
independent verifier exits 137 and 1. Both suites are in the release gate.

This is a bounded attribution repair, not evidence of improved model competency,
Residency completion, deployment or Phase 1 readiness. Exact deployed revision
and a subsequent observed resource-fault case must be checked separately.
