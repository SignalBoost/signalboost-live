// Diagnostic-only Q2B2. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/conciergeSemanticVisualIntent.node.test.ts',
  'tests/conciergeVisualTypoRouting.node.test.ts',
  'tests/visualObjectiveContract.node.test.ts',
  'tests/visualPromptFormatNeutrality.node.test.ts',
  'tests/namedSubjectIntent.node.test.ts',
  'tests/runtimeAcceptanceCleanup.node.test.ts',
  'tests/conciergeNamedPeopleRecovery.node.test.ts',
  'tests/suggestedFollowups.node.test.ts',
  'tests/cosPrimaryDeterministicFreshRouting.node.test.ts',
  'tests/cosDomainAvailability.node.test.ts',
  'tests/assistantTransportClient.node.test.ts',
  'tests/cosDurableTurnHistory.node.test.ts',
  'tests/cosInteractiveGraduateLatency.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
