// Diagnostic-only Q2B1. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/builderRoutingStrict.node.test.ts',
  'tests/assistantHistoryOrdering.node.test.ts',
  'tests/assistantSourceFileBoundary.node.test.ts',
  'tests/conciergeOperationalLogRouting.node.test.ts',
  'tests/conciergeResultDelivery.node.test.ts',
  'tests/fullAssistantConciergeIngress.node.test.ts',
  'tests/builderRepositoryRepairTarget.node.test.ts',
  'tests/builderRepositoryRepairProofController.node.test.ts',
  'tests/builderRepositoryRepairSecurity.node.test.ts',
  'tests/cosSoftwareSpecialistRouting.node.test.ts',
  'tests/cosConciergeSoftwareArchitecture.node.test.ts',
  'tests/conciergeGovernedRepairHardening.node.test.ts',
  'tests/mainWriteDiscipline.node.test.ts',
  'tests/conciergeVisuals.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
