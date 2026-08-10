import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/cosAutonomyFeedback.node.test.ts'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

process.exit(result.status ?? 1)
