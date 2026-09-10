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

test('subject exam remediation adds governed public web without broadening generic unknown study', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  const strategist = file('lib/ai/cos/cosUniversityStudyStrategy.ts')

  assert.match(bridge, /function withGovernedPublicWebForSubjectExamRemediation/)
  assert.match(bridge, /id: 'live_authoritative_research'/)
  assert.match(bridge, /execution: 'automatic_acquisition'/)
  assert.match(bridge, /strategy\.acquisitionSourceKinds\.includes\('approved_public_web'\)/)
  assert.match(bridge, /const strategy = isLanguage \? baseStrategy : withGovernedPublicWebForSubjectExamRemediation\(baseStrategy\)/)

  const refreshStart = bridge.indexOf("if (!isLanguage && !row.acquisition_source_kinds.includes('approved_public_web'))")
  const refreshEnd = bridge.indexOf('return { row, strategy }', refreshStart)
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart)
  const refreshBlock = bridge.slice(refreshStart, refreshEnd)
  assert.match(refreshBlock, /\.update\(\{\s*methods: strategy\.methods,\s*acquisition_source_kinds: strategy\.acquisitionSourceKinds,\s*updated_at: now,\s*\}\)/)
  assert.match(refreshBlock, /\.in\('status', \['queued', 'studying', 'ready_for_exam'\]\)/)

  const unknownStart = strategist.indexOf("case 'reasoning':")
  const unknownEnd = strategist.indexOf('const fineTuneCandidate', unknownStart)
  assert.ok(unknownStart >= 0 && unknownEnd > unknownStart)
  const unknownBranch = strategist.slice(unknownStart, unknownEnd)
  assert.match(unknownBranch, /acquisitionSourceKinds = \[\.\.\.RAG_SOURCE_KINDS\]/)
  assert.doesNotMatch(unknownBranch, /approved_public_web/)
})

test('language exam remediation preserves the exact failed dimension without breaking broad language study', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  const strategist = file('lib/ai/cos/cosUniversityStudyStrategy.ts')
  const store = file('lib/ai/cos/cosUniversityStore.ts')

  assert.match(bridge, /languageDimension: CosPlatformLanguageDimension \| null/)
  assert.match(bridge, /languageDimension: row\.language_dimension/)
  assert.match(bridge, /if \(row\.language_code && row\.language_dimension\)/)
  assert.match(bridge, /dimension: row\.language_dimension/)

  assert.match(strategist, /dimension\?: CosPlatformLanguageDimension \| null/)
  assert.match(strategist, /const dimension = input\.dimension \|\| null/)
  assert.match(strategist, /LANGUAGE_DIMENSION_STUDY_THEMES: Record<CosPlatformLanguageDimension, string\[]>/)
  assert.match(strategist, /writing: \[/)
  assert.match(strategist, /written composition and sentence construction/)
  assert.match(strategist, /editing revision and error correction/)
  assert.match(strategist, /capability: dimension \? `cos_university\.language\.\$\{language\.id\}\.\$\{dimension\}` : `cos_university\.language\.\$\{language\.id\}`/)
  assert.match(strategist, /\.\.\.\(dimension \? \{ missingFacts: studyThemes\.map\(theme => `\$\{language\.title\} \$\{theme\}`\) \} : \{\}\)/)
  assert.match(strategist, /`language_dimension=\$\{dimension\}`/)
  assert.match(strategist, /language_dimensions=comprehension,writing,instruction_following,translation_localization,cultural_pragmatics/)

  // Broad rotation/autopsy language plans intentionally omit a single dimension and must remain valid.
  assert.match(store, /languageDimension: null/)
  assert.match(store, /\? platformLanguageStudyGapSignal\(\{\s*planKey: candidate\.planKey,\s*language: candidate\.language,\s*objective: candidate\.objective,/)

  const dimensionThemesStart = strategist.indexOf('const LANGUAGE_DIMENSION_STUDY_THEMES')
  const dimensionThemesEnd = strategist.indexOf('const LANGUAGE_DIMENSION_LABELS', dimensionThemesStart)
  assert.ok(dimensionThemesStart >= 0 && dimensionThemesEnd > dimensionThemesStart)
  const dimensionThemes = strategist.slice(dimensionThemesStart, dimensionThemesEnd)
  assert.doesNotMatch(dimensionThemes, /hidden exam|rubric|scorer|manifest_hash|seed/i)
})

test('later terminal pass or expired failure retires obsolete remediation instead of starving current work', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  assert.match(bridge, /Only the latest terminal outcome for a competency may\s*\n \* drive remediation/i)
  assert.match(bridge, /if \(row\.status === 'failed'\) supersededFailureIds\.push\(row\.id\)/)
  assert.match(bridge, /if \(!failureIsFresh\(row, target, now\)\)/)
  assert.match(bridge, /\.in\('source_ref', failureIds\)/)
  assert.match(bridge, /\.in\('status', \['queued', 'studying', 'ready_for_exam'\]\)/)
})

test('legacy same-day exam collisions recover only fully proven remediation for a fresh retest', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  assert.match(bridge, /row\.status !== 'superseded' \|\| row\.source_ref !== failure\.id/)
  assert.match(bridge, /Array\.isArray\(studyProof\.evidenceRefs\)/)
  assert.match(bridge, /practice\.readyForIndependentExam === true/)
  assert.match(bridge, /status: 'ready_for_exam'/)
  assert.match(bridge, /reason: 'same_day_exam_identity_collision'/)
  assert.match(bridge, /academicCredit: false/)
})

test('continuous learner keeps failed-exam remediation ahead of generic priority-100 planning', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(runtime, /ensureCosUniversityExamFailureRemediationPlans\(\{ agentId, maxPlans: 4, now \}\)/)
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

test('failed-exam study rotates authoritative discovery instead of repeating one rejected result set forever', () => {
  const bridge = file('lib/ai/cos/cosUniversityExamRemediation.ts')
  const strategist = file('lib/ai/cos/cosUniversityStudyStrategy.ts')
  assert.match(bridge, /REMEDIATION_STUDY_VARIANT_MS = 15 \* 60_000/)
  assert.match(bridge, /cosUniversityRemediationStudyVariant\(now: Date\)/)
  assert.match(bridge, /studyVariant,/)
  assert.match(strategist, /studyVariant\?: number/)
  assert.match(strategist, /const rotatedThemes = \[\.\.\.themes\.slice\(offset\), \.\.\.themes\.slice\(0, offset\)\]/)
  assert.match(strategist, /missingFacts: rotatedThemes/)
  assert.match(strategist, /discoveryQuery: \[\.\.\.rotatedThemes\.slice\(0, 2\), subject\.title\]\.join\(' '\)/)
})

test('daily mining learning may advance only exact University gaps that were actually accepted', () => {
  const route = file('app/api/cron/cos-mining/route.ts')
  assert.match(route, /recordAcceptedCosUniversityStudyAttempts/)
  assert.match(route, /knowledgeGapIdForSignal/)
  assert.match(route, /acceptedGapIds/)
  assert.match(route, /String\(signal\.taskId \|\| ''\)\.endsWith\(plan\.planKey\)/)
  assert.match(route, /filter\(gapId => accepted\.has\(gapId\)\)/)
  assert.match(route, /universityStudyPlansAttempted = \(await recordAcceptedCosUniversityStudyAttempts\(proofs, new Date\(\)\)\)\.length/)
  assert.doesNotMatch(route, /markCosUniversityStudyPlansAttempted/)
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
