// Diagnostic-only single-test gate for tests/cosFreshnessPolicy.node.test.ts. Never merge.
import { spawnSync } from 'node:child_process'
const result=spawnSync(process.execPath,['--test','tests/cosFreshnessPolicy.node.test.ts'],{cwd:process.cwd(),env:process.env,stdio:'inherit'})
if(result.error){console.error(result.error.message);process.exit(1)}
process.exit(result.status??1)
