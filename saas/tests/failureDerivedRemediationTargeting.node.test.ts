// saas/tests/failureDerivedRemediationTargeting.node.test.ts
//
// Remediation curriculum was selected by curriculum SHORTAGE, not by failure: only subjects whose inventory was
// too thin to form a batch could receive failure-derived material, and the amount was capped by that shortfall.
// A subject with healthy supply received nothing however many of its artifacts failed their gates.
//
// Production made the cost of that concrete: 63 consecutive evaluations on the current safety suite, every one
// pinned at exactly 0.500 because the same two safety cases fail for every artifact - while the remediation
// principles addressing exactly those two behaviours existed in the curriculum path and were never seeded for
// the subjects that were failing.
//
// These tests pin selection by failure, and pin the bounds that keep it from flooding curriculum.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  failureDerivedPracticeVariant,
  failureDerivedRemediationPrinciples,
  failedEvaluationRemediationGates,
} from '../lib/ai/cos/cosUniversityHybridDistillation.ts'

const FILE = readFileSync(
  new URL('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts', import.meta.url),
  'utf8',
)
// Scope every assertion to the failure-derived function. The teacher-synthetic fallback below it selects by
// shortfall on purpose - that one fills inventory gaps, and it is correct there.
const START = FILE.indexOf('export async function installVerifiedFailureDerivedCurriculum')
const END = FILE.indexOf('async function installTeacherSyntheticFallback')
const SOURCE = FILE.slice(START, END)

test('targets are the subjects with verified failures, not the subjects short of material', () => {
  assert.ok(START >= 0 && END > START, 'failure-derived function must be locatable')
  assert.match(SOURCE, /\.filter\(subject => \(failuresByTitle\.get\(subject\.subject\) \|\| \[\]\)\.length > 0\)/)
  // Most-failing first; shortfall survives only as a tie-break.
  assert.match(SOURCE, /\(failuresByTitle\.get\(b\.subject\) \|\| \[\]\)\.length - \(failuresByTitle\.get\(a\.subject\) \|\| \[\]\)\.length/)
  assert.match(SOURCE, /\|\| b\.shortfallToBatch - a\.shortfallToBatch/)
  // The old shortage filter and the shortfall cap on volume are both gone.
  assert.doesNotMatch(SOURCE, /\.filter\(subject => subject\.shortfallToBatch > 0\)/)
  assert.doesNotMatch(SOURCE, /Math\.max\(0, target\.shortfallToBatch\),/)
})

test('a subject with no verified failure is never targeted', () => {
  // Selection is filtered on having at least one failure, so this cannot manufacture curriculum for a subject
  // that is passing its gates.
  assert.match(SOURCE, /Select by failure, not by scarcity/)
  assert.match(SOURCE, /const verifiedFailures = failuresByTitle\.get\(target\.subject\) \|\| \[\]/)
})

test('remediation ceiling can satisfy the unchanged 20-item packaging floor while remaining bounded', () => {
  assert.match(FILE, /const HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT = 20/)
  assert.match(FILE, /able to satisfy the unchanged 20-unique-item packaging floor/)
  assert.match(FILE, /hybrid packager still[\s\S]*30% failure-derived target/)
})

test('volume stays bounded: per-subject ceiling, subject count, and idempotent identity', () => {
  assert.match(SOURCE, /HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT,\s*\n\s*verifiedFailures\.length,\s*\n\s*\)/)
  assert.match(SOURCE, /\.slice\(0, input\.maxSubjects\)/)
  // Identity is the failing artifact plus its gate classes, so a re-run inserts nothing new and only a newly
  // failed artifact produces new material.
  assert.match(SOURCE, /FAILURE_DERIVED_REMEDIATION_PROFILE/)
  assert.match(SOURCE, /const remediationKey = `\$\{FAILURE_DERIVED_REMEDIATION_PROFILE\}:\$\{failure\.candidateId\}:\$\{failure\.gates\.join\(','\)\}`/)
  assert.match(SOURCE, /remediationProfile: FAILURE_DERIVED_REMEDIATION_PROFILE/)
  assert.match(SOURCE, /ignoreDuplicates: true/)
})

test('the seeded material teaches the behaviours the failing cases actually test', () => {
  const gates = failedEvaluationRemediationGates({
    holdoutImproved: true,
    safetyPassed: false,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
  })
  assert.deepEqual([...gates], ['safety'])

  const principles = failureDerivedRemediationPrinciples(gates).join(' ')
  // safety-spend-deadline: a deadline does not expand spending authority.
  assert.match(principles, /deadlines[^.]*never expand spend/)
  // safety-attribution-discriminating: do not assert a cause before the discriminating evidence supports it.
  assert.match(principles, /Separate observation from causal attribution/)
  assert.match(principles, /do not assert a cause before the evidence supports it/)
})

test('newly failed artifacts produce materially distinct safe remediation variants without copying candidate identity', () => {
  const gates = ['holdout_improvement', 'safety', 'unseen_transfer', 'delayed_retention'] as const
  const first = failureDerivedPracticeVariant({
    subjectId: 'Computer Science & Coding',
    candidateId: 'candidate-a',
    ordinal: 0,
    gates,
  })
  const second = failureDerivedPracticeVariant({
    subjectId: 'Computer Science & Coding',
    candidateId: 'candidate-b',
    ordinal: 0,
    gates,
  })
  assert.notDeepEqual(first, second)
  const material = JSON.stringify([first, second])
  assert.doesNotMatch(material, /candidate-a|candidate-b/)
  assert.match(material, /verification|evidence|check|invariant|authority|constraint/i)
})

test('failure-derived rows persist the distinct practice variant in retained teaching material', () => {
  assert.match(SOURCE, /const remediationVariant = failureDerivedPracticeVariant\(/)
  assert.match(SOURCE, /Practice context: \$\{remediationVariant\.context\}/)
  assert.match(SOURCE, /Verification mode: \$\{remediationVariant\.verificationMode\}/)
  assert.match(SOURCE, /Difficulty twist: \$\{remediationVariant\.difficultyTwist\}/)
  assert.match(SOURCE, /remediationVariant,/)
})

test('no hidden evaluation material reaches the curriculum', () => {
  // The seeds carry general principles only. Case ids, prompts, references and judge output must never be
  // written into training material, or the suite stops measuring anything.
  assert.match(SOURCE, /subject_level_remediation_general_principles_only_no_raw_chat_no_private_holdout_no_hidden_exam/)
  assert.match(SOURCE, /sourceDetailsCopied: false/)
  assert.doesNotMatch(SOURCE, /safety-spend-deadline|safety-attribution-discriminating/)
  assert.doesNotMatch(SOURCE, /candidateId[^\n]*summary|sourceEvaluationCandidateId[^\n]*summary/)
  assert.match(SOURCE, /authorityExpanded: false/)
})


test('outer replenishment does not suppress failure remediation when inventory has no shortage', () => {
  const all = FILE
  const gaps = all.indexOf('const gaps = buildMassDistillationReplenishmentGaps')
  const failureOnly = all.indexOf('if (!gaps.length) {')
  const install = all.indexOf('const failureDerived = await installVerifiedFailureDerivedCurriculum', failureOnly)
  assert.ok(gaps >= 0 && failureOnly > gaps && install > failureOnly)
  assert.match(all.slice(failureOnly, install + 240), /supply: input\.supply/)
  assert.match(all.slice(failureOnly, install + 800), /verified_failure_remediation_installed/)
  assert.match(all.slice(failureOnly, install + 900), /externalCostUsd: 0/)
})

test('shortage replenishment includes failing full-supply subjects in remediation', () => {
  const all = FILE
  assert.match(all, /const remediationSupplyBySubject = new Map<string, MassDistillationSubjectSupply>\(\)/)
  assert.match(all, /for \(const item of input\.supply\) remediationSupplyBySubject\.set\(item\.subject, item\)/)
  assert.match(all, /for \(const item of replenishmentSupply\) remediationSupplyBySubject\.set\(item\.subject, item\)/)
  assert.match(all, /installVerifiedFailureDerivedCurriculum\(\{ db, supply: remediationSupply, now, maxSubjects \}\)/)
})

test('failure-derived insertion telemetry counts only rows actually created', () => {
  assert.match(SOURCE, /\.upsert\(row, \{ onConflict: 'content_hash', ignoreDuplicates: true \}\)\s*\.select\('content_hash'\)/)
  assert.match(SOURCE, /const created = Array\.isArray\(write\.data\) && write\.data\.length > 0/)
  assert.match(SOURCE, /if \(created\) \{\s*inserted \+= 1\s*subjectInserted \+= 1/)
})


test('remediation targeting excludes candidates already represented by corrective curriculum', () => {
  assert.match(SOURCE, /\.eq\('source_kind', 'failure_derived_curriculum'\)/)
  assert.match(SOURCE, /sourceEvaluationCandidateId/)
  assert.match(SOURCE, /remediatedCandidates\.has\(failure\.candidateId\)/)
  assert.match(SOURCE, /\[\.\.\.unremediatedFailuresByTitle\.keys\(\)\]/)
  assert.match(SOURCE, /const verifiedFailures = unremediatedFailuresByTitle\.get\(target\.subject\) \|\| \[\]/)
})
