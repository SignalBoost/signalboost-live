// Diagnostic-only Q3B1. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
  'tests/cosRetrievalSelfReflection.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
  'tests/cosNativeAgentFreshnessGuard.node.test.ts',
  'tests/cosTravelPlanningFreshness.node.test.ts',
  'tests/cosFreshGroundedTask.node.test.ts',
  'tests/listCatalogIntent.node.test.ts',
  'tests/cosFreshLiveRouting.node.test.ts',
  'tests/freshEvidenceLocalSynthesis.node.test.ts',
  'tests/freshEvidenceNeuralReview.node.test.ts',
  'tests/freshEvidencePredicateAmbiguity.node.test.ts',
  'tests/cosFreshGrounding.node.test.ts',
  'tests/cosStructuredLiveInfo.node.test.ts',
  'tests/cosTemporalClaimGuard.node.test.ts',
  'tests/cosLocalDiscovery.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
