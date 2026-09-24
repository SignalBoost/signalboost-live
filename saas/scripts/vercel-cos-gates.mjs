// TEMP DIAGNOSTIC BISECT — do not merge.
import { spawnSync } from 'node:child_process'
const tests = [
  "tests/cosUniversityLaneExpectation.node.test.ts",
  "tests/cosUniversityLaneFaultRecorder.node.test.ts",
  "tests/cosUniversityFineTuneEvidence.node.test.ts",
  "tests/cosUniversityFrontierDistillation.node.test.ts",
  "tests/cosUniversityMassDistilledEvaluation.node.test.ts",
  "tests/cosUniversityMassEvaluationJudgeTimeoutContract.node.test.ts",
  "tests/cosUniversityGraduateActivationCron.node.test.ts",
  "tests/universityDistillationRecoveryDrillSafety.node.test.ts",
  "tests/cosUniversityRecoveryDrill.node.test.ts",
  "tests/cosUniversityTeacherPool.node.test.ts",
  "tests/cosUniversityTeacherAdapters.node.test.ts",
  "tests/cosUniversityMassHostedTeacherStage.node.test.ts",
  "tests/cosUniversityTelemetry.node.test.ts",
  "tests/cosWorkingDistillationDispatch.node.test.ts"
]
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
