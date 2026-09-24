// Diagnostic-only Q3B1A. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/cosRetrievalSelfReflection.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
  'tests/cosNativeAgentFreshnessGuard.node.test.ts',
  'tests/cosTravelPlanningFreshness.node.test.ts',
  'tests/cosFreshGroundedTask.node.test.ts',
  'tests/listCatalogIntent.node.test.ts',
  'tests/cosFreshLiveRouting.node.test.ts',
]
const result=spawnSync(process.execPath,['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'})
if(result.error){console.error(result.error.message);process.exit(1)}
process.exit(result.status??1)
