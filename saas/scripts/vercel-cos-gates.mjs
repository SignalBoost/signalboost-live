// saas/scripts/vercel-cos-gates.mjs
import { spawnSync } from 'node:child_process'

// Focused production repair gate for the regressions changed in this PR.
// Broader historical suites remain independently tracked and must not hide these repaired failures.
const tests = [
  'tests/builderRepositoryRepairProofController.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
  'tests/cosTravelPlanningFreshness.node.test.ts',
  'tests/cosPragmaticIntentCore.node.test.ts',
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
