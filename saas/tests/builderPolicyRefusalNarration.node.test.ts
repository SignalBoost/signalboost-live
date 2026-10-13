// saas/tests/builderPolicyRefusalNarration.node.test.ts
//
// Production 2026-10-13: the repository runner refused `npm test` (exit 125, builder_repository_broad_test_blocked;
// the command was never executed), and the owner's report said "Found — I reproduced the reported failure ... with
// `npm test`". The only executed test (agentGateway) passed 9/9. #4292 stopped the tool loop from treating the
// refusal as a failure; the evidence classifier behind the report still filed it as "exited_nonzero" because the
// refusal carries an exit code. A host refusal is now "blocked before execution" in evidence and in the report.
import assert from 'node:assert/strict'
import test from 'node:test'
import { builderEvidenceEvents } from '../lib/builder/evidence-events.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'

const REFUSAL = 'builder_repository_broad_test_blocked: select the smallest relevant test file and run it directly; the complete repository suite runs later in PR CI'
const AGENT_GATEWAY_PASS = '✔ an allowlisted reversible action (via MCP) executes and audits as a notice\nℹ tests 9\nℹ pass 9\nℹ fail 0\n'

// The trace shapes Production stored for this job (job-runner publicTrace and the tool-loop trace).
const productionTrace = [
  { round: 1, toolId: 'list_files', ok: true },
  { round: 2, toolId: 'list_files', ok: false, error: 'builder_repeated_tool_call:list_files; choose a different next step' },
  { round: 3, toolId: 'run', ok: false, command: 'npm test', input: { command: 'npm test' },
    output: { exitCode: 125, stdout: '', stderr: REFUSAL, timedOut: false }, error: 'builder_repository_broad_test_blocked', failureClass: 'runtime' },
  { round: 4, toolId: 'run', ok: true, command: 'node --test tests/agentGateway.node.test.ts', input: { command: 'node --test tests/agentGateway.node.test.ts' },
    output: { exitCode: 0, stdout: AGENT_GATEWAY_PASS, stderr: '', timedOut: false } },
  { round: 5, toolId: 'run', ok: false, input: { command: 'npm test' }, error: 'builder_repeated_tool_call:run; choose a different next step' },
]

test('a host-refused run is blocked before execution, never an exited_nonzero result', () => {
  const events = builderEvidenceEvents(productionTrace)
  assert.equal(events[2].outcome, 'blocked_before_execution')
  assert.equal(events[3].outcome, 'exited_zero')
})

test('the report never claims a host-refused npm test reproduced the failure', () => {
  const reply = formatBuilderOperatorRepairReply({ ok: false, error: 'builder_stalled_repeated_inspection', trace: productionTrace })
  assert.doesNotMatch(reply, /reproduced/i, reply)
  assert.match(reply, /no failing proof was recorded|remaining blocker/i, reply)
})

test('a real failing test run is still reported as reproduced', () => {
  const realFailure = [{ round: 1, toolId: 'run', ok: false, input: { command: 'node --test tests/a.node.test.ts' },
    output: { exitCode: 1, stdout: 'ℹ fail 1\n', stderr: '', timedOut: false }, error: 'builder_command_failed: exit 1', failureClass: 'test' }]
  assert.equal(builderEvidenceEvents(realFailure)[0].outcome, 'exited_nonzero')
  assert.match(formatBuilderOperatorRepairReply({ ok: false, error: 'x', trace: realFailure }), /reproduced the reported failure/)
})
// end of saas/tests/builderPolicyRefusalNarration.node.test.ts (if this line is missing, the paste was cut short)
