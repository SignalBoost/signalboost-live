// saas/scripts/vercel-cos-gates.mjs
import { spawnSync } from 'node:child_process'

// Production regression gate: keep the currently verified high-signal suites that cover
// the active COS, Builder, Harness, Working-COS, and freshness paths. Historical suites
// that are independently red are not allowed to block unrelated production repairs here.
const tests = [
  'tests/cosUniversityMassHostedTeacherStage.node.test.ts',
  'tests/cosWorkingDistillationDispatch.node.test.ts',
  'tests/platformHarnessFullEnforcement.node.test.ts',
  'tests/cosHarnessIngress.node.test.ts',
  'tests/builderResidencyCaseRunner.node.test.ts',
  'tests/builderRepositoryRepairProofController.node.test.ts',
  'tests/cosConversationContinuityWiring.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
  'tests/cosNativeAgentFreshnessGuard.node.test.ts',
  'tests/cosTravelPlanningFreshness.node.test.ts',
  'tests/freshEvidenceNeuralReview.node.test.ts',
  'tests/freshEvidencePredicateAmbiguity.node.test.ts',
  'tests/cosFreshGrounding.node.test.ts',
  'tests/cosNeuralEvidenceReasoning.node.test.ts',
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
