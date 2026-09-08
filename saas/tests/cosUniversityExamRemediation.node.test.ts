import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('failed independent exams create priority remediation without exposing hidden scorer details', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  assert.match(bridge, /from\('cos_university_exam_runs'\)/)
  assert.match(bridge, /\.eq\('status', 'failed'\)/)
  assert.match(bridge, /source_kind: SOURCE_KIND/)
  assert.match(bridge, /SOURCE_KIND = 'recertification'/)
  assert.match(bridge, /priority = isLanguage \? 124 : 122/)
  assert.match(bridge, /hiddenExamDetailsExposed: false/)
  assert.match(bridge, /hidden exam rubric/i)
  assert.doesNotMatch(bridge, /select\([^)]*reasons/)
  assert.doesNotMatch(bridge, /manifest_hash/)
  assert.doesNotMatch(bridge, /seed/)
})

test('continuous learner merges failed-exam remediation ahead of generic planning', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(runtime, /ensureCosUniversityExamFailureRemediationPlans/)
  assert.match(runtime, /examFailuresPrioritized/)
  assert.match(runtime, /\[\.\.\.remediation\.activePlans, \.\.\.planning\.activePlans\]/)
  assert.match(runtime, /b\.priority - a\.priority/)
  assert.match(runtime, /\[\.\.\.remediation\.gapSignals, \.\.\.planning\.gapSignals\]/)
  assert.match(runtime, /markCosUniversityStudyPlansAttempted/)
})

test('deliberate practice executes through the dedicated local training seam and cannot write academic credit', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  assert.match(runner, /callCosReasoner/)
  assert.match(runner, /This is training, not an owner-facing advisory answer/)
  assert.match(runner, /externalEscalationAllowed: false/)
  assert.match(runner, /academicCredit: false/)
  assert.doesNotMatch(runner, /tryCOSFirstAnswer/)
  assert.doesNotMatch(runner, /recordCosUniversityAssessment/)
})
