// Diagnostic-only HF continuous-acquisition invariant. Never merge.
import { spawnSync } from 'node:child_process'

const tests = [
  'tests/hfOpenDatasetContinuousAcquisition.node.test.ts',
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
