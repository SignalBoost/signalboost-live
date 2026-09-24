// saas/scripts/vercel-cos-gates.mjs
import { spawnSync } from 'node:child_process'

// Focused Production regression gate restored from the last Vercel-verified release state.
// Diagnostic-only one-test bisects must never be merged to main.
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
