import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_A_RANGE_MINIMUM_DISTINCT_PASSES,
  aRangeStagePassesSinceLatestFailure,
  aRangeStageThresholdMet,
  buildCosUniversityARangeExam,
  isCosUniversityVerifiedProductionSource,
  scoreCosUniversityARangeExam,
  type CosUniversityARangeRunEvidence,
} from '../lib/ai/cos/cosUniversityARange.ts'
import {
  COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES,
  buildCosUniversityLanguageARangeExam,
  languageARangeStagePassesSinceLatestFailure,
  languageARangeStageThresholdMet,
  parseCosUniversityVerifiedLanguageProductionSource,
  scoreCosUniversityLanguageARangeExam,
  type CosUniversityLanguageARangeRunEvidence,
} from '../lib/ai/cos/cosUniversityLanguageARange.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('A-range requires two materially distinct passes and a later failure resets the stage', () => {
  const rows: CosUniversityARangeRunEvidence[] = [
    { stage: 'cross_domain_transfer', subjectId: 'computer_science', passed: true, variantHash: 'variant-a', observedAt: '2026-09-01T00:00:00Z' },
    { stage: 'cross_domain_transfer', subjectId: 'computer_science', passed: true, variantHash: 'variant-a', observedAt: '2026-09-02T00:00:00Z' },
  ]
  assert.equal(COS_UNIVERSITY_A_RANGE_MINIMUM_DISTINCT_PASSES, 2)
  assert.equal(aRangeStagePassesSinceLatestFailure(rows, 'cross_domain_transfer', 'computer_science'), 1)
  assert.equal(aRangeStageThresholdMet(rows, 'cross_domain_transfer', 'computer_science'), false)
  rows.push({ stage: 'cross_domain_transfer', subjectId: 'computer_science', passed: true, variantHash: 'variant-b', observedAt: '2026-09-03T00:00:00Z' })
  assert.equal(aRangeStageThresholdMet(rows, 'cross_domain_transfer', 'computer_science'), true)
  rows.push({ stage: 'cross_domain_transfer', subjectId: 'computer_science', passed: false, variantHash: 'variant-c', observedAt: '2026-09-04T00:00:00Z' })
  assert.equal(aRangeStagePassesSinceLatestFailure(rows, 'cross_domain_transfer', 'computer_science'), 0)
  assert.equal(aRangeStageThresholdMet(rows, 'cross_domain_transfer', 'computer_science'), false)
})

test('transfer and capstone manifests are deterministic, hidden-seed varied, and genuinely cross-domain', () => {
  const transfer = buildCosUniversityARangeExam({ seed: '11111111-1111-4111-8111-111111111111', stage: 'cross_domain_transfer', subjectId: 'cybersecurity' })
  const same = buildCosUniversityARangeExam({ seed: '11111111-1111-4111-8111-111111111111', stage: 'cross_domain_transfer', subjectId: 'cybersecurity' })
  const different = buildCosUniversityARangeExam({ seed: '22222222-2222-4222-8222-222222222222', stage: 'cross_domain_transfer', subjectId: 'cybersecurity' })
  const capstone = buildCosUniversityARangeExam({ seed: '33333333-3333-4333-8333-333333333333', stage: 'capstone', subjectId: 'cybersecurity' })
  assert.equal(transfer.manifestHash, same.manifestHash)
  assert.notEqual(transfer.manifestHash, different.manifestHash)
  assert.equal(transfer.companionSubjectIds.length, 2)
  assert.equal(capstone.companionSubjectIds.length, 5)
  assert.equal(transfer.companionSubjectIds.includes('cybersecurity'), false)
  assert.equal(capstone.companionSubjectIds.includes('cybersecurity'), false)
})

test('host scorer requires provenance plus every hidden domain/fact group', () => {
  const exam = buildCosUniversityARangeExam({ seed: '44444444-4444-4444-8444-444444444444', stage: 'cross_domain_transfer', subjectId: 'reasoning_decision_science' })
  const body = [
    ...exam.rubric.requiredHeadings.map(heading => `${heading}:`),
    ...exam.rubric.requiredGroups.map(group => group[0]),
    'The missing Production state remains unknown. I would verify it before claiming completion.',
  ].join('\n')
  const good = scoreCosUniversityARangeExam(exam, body, { handled: true, localReasoning: true, externalAi: false, semanticCache: false, turnId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(good.passed, true, good.reasons.join(','))
  const bad = scoreCosUniversityARangeExam(exam, body, { handled: true, localReasoning: true, externalAi: true, semanticCache: false, turnId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(bad.passed, false)
  assert.ok(bad.reasons.includes('external_ai_used'))
})

test('Production transfer accepts only explicit verified Production namespace and rejects tests/benchmarks', () => {
  assert.equal(isCosUniversityVerifiedProductionSource('production_verified:builder_job:abc123'), true)
  assert.equal(isCosUniversityVerifiedProductionSource('production_verified:customer_outcome:release-42'), true)
  assert.equal(isCosUniversityVerifiedProductionSource('capability_benchmark:code'), false)
  assert.equal(isCosUniversityVerifiedProductionSource('evidence_utilization_benchmark:postgres'), false)
  assert.equal(isCosUniversityVerifiedProductionSource('production_verified:synthetic_test:42'), false)
  assert.equal(isCosUniversityVerifiedProductionSource('production_verified:validation:42'), false)
  assert.equal(isCosUniversityVerifiedProductionSource('chief_of_staff_blind_acceptance'), false)
})

test('runtime scans only exact-turn production_verified outcomes and never upgrades benchmark sources', () => {
  const runner = file('lib/ai/cos/cosUniversityARangeRunner.ts')
  assert.match(runner, /\.like\('outcome_source', 'production_verified:%'\)/)
  assert.match(runner, /\.eq\('turn_id', outcome\.turn_id\)/)
  assert.match(runner, /isCosUniversityVerifiedProductionSource\(source\)/)
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /localModelInvoked/)
  assert.match(runner, /externalAiInvoked/)
  assert.match(runner, /scorerAuthority: authority/)
  assert.doesNotMatch(runner, /capability_benchmark:/)
  assert.doesNotMatch(runner, /evidence_utilization_benchmark:/)
})

test('A-range ledger is service-only and stores no prompt, rubric, reply, or grade', () => {
  const schema = file('supabase/migrations/20260908014500_cos_university_a_range_evidence.sql')
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_a_range_runs from anon, authenticated/i)
  assert.match(schema, /grant select, insert, update, delete on table public\.cos_university_a_range_runs to service_role/i)
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
  assert.doesNotMatch(schema, /\bgrade\s+text\b/i)
})

test('A-range cron is feature-gated and runs after the unseen examiner', () => {
  const vercel = JSON.parse(file('vercel.json')) as { env: Record<string, string>; crons: Array<{ path: string; schedule: string }> }
  assert.equal(vercel.env.COS_UNIVERSITY_A_RANGE_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-exam'), { path: '/api/cron/cos-university-exam', schedule: '0 7 * * *' })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-a-range'), { path: '/api/cron/cos-university-a-range', schedule: '10 7 * * *' })
  const route = file('app/api/cron/cos-university-a-range/route.ts')
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /runCosUniversityARangeBatch/)
})

test('five-language A-range requires two distinct passes per target and resets on later failure', () => {
  const rows: CosUniversityLanguageARangeRunEvidence[] = [
    { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing', passed: true, variantHash: 'pl-a', observedAt: '2026-09-01T00:00:00Z' },
    { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing', passed: true, variantHash: 'pl-a', observedAt: '2026-09-02T00:00:00Z' },
  ]
  assert.equal(COS_UNIVERSITY_LANGUAGE_A_RANGE_MINIMUM_DISTINCT_PASSES, 2)
  assert.equal(languageARangeStagePassesSinceLatestFailure(rows, 'cross_domain_transfer', 'pl', 'writing'), 1)
  rows.push({ stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing', passed: true, variantHash: 'pl-b', observedAt: '2026-09-03T00:00:00Z' })
  assert.equal(languageARangeStageThresholdMet(rows, 'cross_domain_transfer', 'pl', 'writing'), true)
  rows.push({ stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing', passed: false, variantHash: 'pl-c', observedAt: '2026-09-04T00:00:00Z' })
  assert.equal(languageARangeStageThresholdMet(rows, 'cross_domain_transfer', 'pl', 'writing'), false)
})

test('language transfer is host-seeded, target-language scored, and integrated capstone is not a single dimension', () => {
  const transfer = buildCosUniversityLanguageARangeExam({
    seed: '55555555-5555-4555-8555-555555555555',
    target: { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing' },
  })
  const same = buildCosUniversityLanguageARangeExam({
    seed: '55555555-5555-4555-8555-555555555555',
    target: { stage: 'cross_domain_transfer', language: 'pl', dimension: 'writing' },
  })
  const capstone = buildCosUniversityLanguageARangeExam({
    seed: '66666666-6666-4666-8666-666666666666',
    target: { stage: 'capstone', language: 'ru', dimension: null },
  })
  assert.equal(transfer.manifestHash, same.manifestHash)
  assert.equal(transfer.rubric.targetLanguage, 'pl')
  assert.equal(capstone.dimension, null)
  assert.deepEqual(capstone.rubric.requiredSections, ['[COMPREHENSION]', '[WRITING]', '[ACTIONS]', '[LOCALIZATION]', '[PRAGMATICS]'])

  const body = [
    ...transfer.rubric.requiredGroups.map(group => group[0]),
    'Projekt pozostaje nieznany tam, gdzie brak weryfikacji. Wdrożenie produkcyjne wymaga dowodów.',
  ].join(' ')
  const score = scoreCosUniversityLanguageARangeExam(transfer, body, {
    handled: true, localReasoning: true, externalAi: false, semanticCache: false,
    turnId: '55555555-5555-4555-8555-555555555555',
  })
  assert.equal(score.passed, true, score.reasons.join(','))
})

test('language Production credit requires an explicit verified language and dimension namespace', () => {
  assert.deepEqual(parseCosUniversityVerifiedLanguageProductionSource('production_verified:language:pl:writing:customer-message-42'), {
    language: 'pl', dimension: 'writing', reference: 'customer-message-42',
  })
  assert.deepEqual(parseCosUniversityVerifiedLanguageProductionSource('production_verified:language:es:cultural_pragmatics:customer-reply-7'), {
    language: 'es', dimension: 'cultural_pragmatics', reference: 'customer-reply-7',
  })
  assert.equal(parseCosUniversityVerifiedLanguageProductionSource('production_verified:language:xx:writing:customer-message-42'), null)
  assert.equal(parseCosUniversityVerifiedLanguageProductionSource('production_verified:language:pl:writing:synthetic_test-42'), null)
  assert.equal(parseCosUniversityVerifiedLanguageProductionSource('production_verified:customer_outcome:release-42'), null)
})

test('language A-range runtime is exact-turn, local-only, bounded, and capstone writes every language dimension', () => {
  const runner = file('lib/ai/cos/cosUniversityLanguageARangeRunner.ts')
  assert.match(runner, /\.like\('outcome_source', 'production_verified:language:%'\)/)
  assert.match(runner, /\.eq\('turn_id', outcome\.turn_id\)/)
  assert.match(runner, /target_kind: 'language'/)
  assert.match(runner, /disableCache: true/)
  assert.match(runner, /language: row\.language_code/)
  assert.match(runner, /for \(const dimension of dimensions\)/)
  assert.match(runner, /allProductionDimensionsPassed/)
  assert.doesNotMatch(runner, /capability_benchmark:/)
  assert.doesNotMatch(runner, /synthetic_test:/)
})

test('language A-range migration extends the same service-only ledger without creating a second grade store', () => {
  const schema = file('supabase/migrations/20260908023500_cos_university_language_a_range.sql')
  assert.match(schema, /add column if not exists target_kind text not null default 'subject'/i)
  assert.match(schema, /add column if not exists language_code text/i)
  assert.match(schema, /add column if not exists language_dimension text/i)
  assert.match(schema, /target_kind = 'language'/i)
  assert.match(schema, /stage = 'capstone' and language_dimension is null/i)
  assert.match(schema, /revoke all on table public\.cos_university_a_range_runs from anon, authenticated/i)
  assert.match(schema, /grant select, insert, update, delete on table public\.cos_university_a_range_runs to service_role/i)
  assert.doesNotMatch(schema, /create table/i)
  assert.doesNotMatch(schema, /\bgrade\b/i)
})

test('language A-range has an independent bounded cron after subject A-range', () => {
  const vercel = JSON.parse(file('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-language-a-range'), {
    path: '/api/cron/cos-university-language-a-range', schedule: '20 7 * * *',
  })
  const route = file('app/api/cron/cos-university-language-a-range/route.ts')
  assert.match(route, /auth !== `Bearer \$\{secret\}`/)
  assert.match(route, /runCosUniversityLanguageARangeBatch/)
  assert.match(route, /maxDuration = 300/)
})
