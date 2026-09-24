// Diagnostic-only Harness gate isolation. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/platformHarness.node.test.ts',
  'tests/platformHarnessRuntime.node.test.ts',
  'tests/platformHarnessFullEnforcement.node.test.ts',
  'tests/platformHarnessCompensation.node.test.ts',
  'tests/platformHarnessAbsoluteDeadline.node.test.ts',
  'tests/cosHarnessIngress.node.test.ts',
  'tests/cosSoftwareSpecialistProductionHarness.node.test.ts',
  'tests/cosA2ASpecialistHarnessIngress.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
