// Diagnostic-only Q3B2. Never merge.
import { spawnSync } from 'node:child_process'
const tests = [
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
