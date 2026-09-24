// Diagnostic-only Q2A slice of the full production gate. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/builderProjectContext.node.test.ts',
  'tests/builderExecutionEvidence.node.test.ts',
  'tests/builderProjectContinuity.node.test.ts',
  'tests/agentProgressStreaming.node.test.ts',
  'tests/auditCosRuntime.node.test.ts',
  'tests/deterministicUtilities.node.test.ts',
  'tests/engineeringConstants.node.test.ts',
  'tests/calcExpressions.node.test.ts',
  'tests/publicDisclosureGate.node.test.ts',
  'tests/cosIdentityDisclosureBoundary.node.test.ts',
  'tests/publicGovernanceParity.node.test.ts',
  'tests/conciergeBrowserIngressRouting.node.test.ts',
  'tests/conciergeFullTranscript.node.test.ts',
  'tests/conciergeTransportBudget.node.test.ts',
  'tests/pastedOperationalLog.node.test.ts',
  'tests/repairConfirmationIntent.node.test.ts',
  'tests/attachedOperationalEvidence.node.test.ts',
  'tests/builderOperationalLogRouting.node.test.ts',
  'tests/builderContractOscillation.node.test.ts',
  'tests/builderTimeBudget.node.test.ts',
  'tests/builderControlRecovery.node.test.ts',
  'tests/builderControlAdapter.node.test.ts',
  'tests/builderRequestDeadline.node.test.ts',
  'tests/builderTransportRecovery.node.test.ts',
  'tests/builderAsyncJobs.node.test.ts',
  'tests/builderObjectiveContract.node.test.ts',
  'tests/builderDebugFileJob.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
