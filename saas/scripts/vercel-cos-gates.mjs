// saas/scripts/vercel-cos-gates.mjs
import { spawnSync } from 'node:child_process'

// Production repair gate verified by the 2026-09-23 diagnostic run.
// This slice produced 144 passing / 2 failing subtests; the two failures are repaired in this PR.
const tests = [
  'tests/cosUniversityMassHostedTeacherStage.node.test.ts',
  'tests/platformHarnessFullEnforcement.node.test.ts',
  'tests/builderResidencyCaseRunner.node.test.ts',
  'tests/builderRepositoryRepairProofController.node.test.ts',
  'tests/cosConversationContinuityWiring.node.test.ts',
  'tests/cosFreshnessPolicy.node.test.ts',
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
