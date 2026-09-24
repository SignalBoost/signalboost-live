// saas/scripts/vercel-cos-gates.mjs
// Focused production gate for the current live COS ingress path.
// Preserve the existing travel freshness regression and cover mandatory COS and specialist Harness ingress.
// Broader platform-wide Harness acceptance remains a separate gate and is not claimed here.
import { spawnSync } from 'node:child_process'

const tests = [
  'tests/cosTravelPlanningFreshness.node.test.ts',
  'tests/cosHarnessIngress.node.test.ts',
  'tests/cosSoftwareSpecialistProductionHarness.node.test.ts',
  'tests/cosA2ASpecialistHarnessIngress.node.test.ts',
  'tests/builderResidencyLiveHost.node.test.ts',
]

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})
if (result.error) {
  console.error('[vercel-cos-gates] failed to launch test runner:', result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
