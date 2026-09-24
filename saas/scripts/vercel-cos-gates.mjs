// Diagnostic-only Q2B1A. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/builderRoutingStrict.node.test.ts',
  'tests/assistantHistoryOrdering.node.test.ts',
  'tests/assistantSourceFileBoundary.node.test.ts',
  'tests/conciergeOperationalLogRouting.node.test.ts',
  'tests/conciergeResultDelivery.node.test.ts',
  'tests/fullAssistantConciergeIngress.node.test.ts',
  'tests/builderRepositoryRepairTarget.node.test.ts',
]
const result=spawnSync(process.execPath,['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'})
if(result.error){console.error(result.error.message);process.exit(1)}
process.exit(result.status??1)
