// Diagnostic-only Q2B1B. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/builderRepositoryRepairProofController.node.test.ts',
  'tests/builderRepositoryRepairSecurity.node.test.ts',
  'tests/cosSoftwareSpecialistRouting.node.test.ts',
  'tests/cosConciergeSoftwareArchitecture.node.test.ts',
  'tests/conciergeGovernedRepairHardening.node.test.ts',
  'tests/mainWriteDiscipline.node.test.ts',
  'tests/conciergeVisuals.node.test.ts',
]
const result=spawnSync(process.execPath,['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'})
if(result.error){console.error(result.error.message);process.exit(1)}
process.exit(result.status??1)
