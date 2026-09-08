import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('failed independent exams create schema-valid priority remediation without exposing hidden scorer details', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  const schema = file('supabase/migrations/20260908002000_cos_university_continuous_learning.sql')
  assert.match(bridge, /from\('cos_university_exam_runs'\)/)
  assert.match(bridge, /\.in\('status', \['passed', 'failed'\]\)/)
  assert.match(bridge, /latestByTarget/)
  assert.match(bridge, /universityExamValidityDays/)
  assert.match(bridge, /supersedeResolvedFailurePlans/)
  assert.match(bridge, /status: 'superseded'/)
  assert.match(bridge, /source_kind: SOURCE_KIND/)
  assert.match(bridge, /SOURCE_KIND = 'recertification'/)
  assert.match(schema, /priority integer not null default 50 check \(priority between 1 and 100\)/i)
  assert.match(bridge, /const priority = 100/)
  assert.doesNotMatch(bridge, /priority = isLanguage \? 124 : 122/)
  assert.match(bridge, /hiddenExamDetailsExposed: false/)
  assert.match(bridge, /hidden exam rubric/i)
  assert.doesNotMatch(bridge, /select\([^)]*reasons/)
  assert.doesNotMatch(bridge, /manifest_hash/)
  assert.doesNotMatch(bridge, /seed/)
})

test('later terminal pass or expired failure retires obsolete remediation instead of starving current work', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  assert.match(bridge, /Only the latest terminal outcome for a competency may\s*\n \* drive remediation/i)
  assert.match(bridge, /if \(row\.status === 'failed'\) supersededFailureIds\.push\(row\.id\)/)
  assert.match(bridge, /if \(!failureIsFresh\(row, target, now\)\)/)
  assert.match(bridge, /\.in\('source_ref', failureIds\)/)
  assert.match(bridge, /\.in\('status', \['queued', 'studying', 'ready_for_exam'\]\)/)
})

test('continuous learner keeps failed-exam remediation ahead of generic priority-100 planning', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(runtime, /ensureCosUniversityExamFailureRemediationPlans/)
  assert.match(runtime, /examFailuresPrioritized/)
  assert.match(runtime, /\[\.\.\.remediation\.activePlans, \.\.\.planning\.activePlans\]/)
  assert.match(runtime, /const remediationPlanIds = new Set\(remediation\.activePlans\.map\(plan => plan\.id\)\)/)
  assert.match(runtime, /Number\(remediationPlanIds\.has\(b\.id\)\) - Number\(remediationPlanIds\.has\(a\.id\)\)/)
  assert.match(runtime, /b\.priority - a\.priority/)
  assert.match(runtime, /\[\.\.\.remediation\.gapSignals, \.\.\.planning\.gapSignals\]/)
  assert.match(runtime, /recordAcceptedCosUniversityStudyAttempts/)
  assert.match(runtime, /universityStudyProofsFromAcceptedLearning/)
  assert.doesNotMatch(runtime, /markCosUniversityStudyPlansAttempted/)
})

test('continuous learner records structured database errors instead of object stringification', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(runtime, /function describeError\(error: unknown\): string/)
  assert.match(runtime, /row\.code \? `code=\$\{String\(row\.code\)\}`/)
  assert.match(runtime, /row\.message \? `message=\$\{String\(row\.message\)\}`/)
  assert.match(runtime, /summary\.errors\.push\(describeError\(error\)\)/)
  assert.match(runtime, /finish:\$\{describeError\(finishError\)\}/)
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
