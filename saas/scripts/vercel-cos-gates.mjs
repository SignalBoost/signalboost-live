// Diagnostic gate: isolate mandatory COS Harness ingress regression before the normal prebuild/build.
import { spawnSync } from 'node:child_process'
const result = spawnSync(process.execPath, ['--test', 'tests/cosHarnessIngress.node.test.ts'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
