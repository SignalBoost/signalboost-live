// Diagnostic-only Q3B slice of the full production gate. Never merge.
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
  'tests/cosCurrentWorldLearning.node.test.ts',
  'tests/cosWebTrainingDataLayer.node.test.ts',
  'tests/cosWebTrainingPdfText.node.test.ts',
  'tests/cosLearningTargetLanguage.node.test.ts',
  'tests/cosLearnedCorpusContinuousIndexing.node.test.ts',
  'tests/cosDirectedStudy.node.test.ts',
  'tests/specialistLearning.node.test.ts',
  'tests/cosDirectedStudyPromotion.node.test.ts',
  'tests/cosAnswerFreshnessSelfReflection.node.test.ts',
  'tests/cosCacheReplayCurrentPolicy.node.test.ts',
  'tests/cosScenarioPremiseIntegrity.node.test.ts',
  'tests/cosPublicGenericScenarioIsolation.node.test.ts',
  'tests/cosReusableReasoningPatterns.node.test.ts',
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
