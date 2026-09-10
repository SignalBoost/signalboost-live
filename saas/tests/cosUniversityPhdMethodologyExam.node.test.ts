import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  buildCosUniversityPhdMethodologyExam,
  scoreCosUniversityPhdMethodologyExam,
  validateCosUniversityPhdMethodologyRubric,
} from '../lib/ai/cos/cosUniversityPhdMethodologyExam.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

// Deliberately synthetic test-only vocabulary. Production rubric values never live in source control.
const TEST_RUBRIC = validateCosUniversityPhdMethodologyRubric({
  maxWords: 500,
  sections: [
    { heading: 'Claim', minWords: 12, conceptGroups: [['orchid'], ['granite']] },
    { heading: 'Design', minWords: 10, conceptGroups: [['amber'], ['quartz']] },
    { heading: 'Threats', minWords: 10, conceptGroups: [['tundra'], ['cedar']] },
    { heading: 'Test', minWords: 10, conceptGroups: [['violet'], ['delta']] },
    { heading: 'Reproducibility', minWords: 10, conceptGroups: [['harbor'], ['linen']] },
  ],
  unsupportedAssertions: ['cerulean certainty'],
  directRejectionPrefixes: ['not true that'],
  directRejectionSuffixes: ['is rejected', 'is unsupported'],
})

const provenance = (turnId = 'turn-test') => ({
  localReasoning: true,
  externalAi: false,
  semanticCache: false,
  handled: true,
  turnId,
})

function groundedReply(seed: string, claimExtra = '') {
  const exam = buildCosUniversityPhdMethodologyExam(seed, 'security_trust_research')
  const packet = exam.packet
  const reply = [
    `Claim: The ${packet.interventionAnchor} moved the reported metric from ${packet.beforePercent}% to ${packet.afterPercent}% across ${packet.sampleSize} cases. Orchid and granite frame this packet-specific claim ${claimExtra}.`,
    'Design: Amber and quartz describe a stronger comparison design with enough detail to challenge the reported relationship.',
    `Threats: The ${packet.changedConditionAnchor} is packet-specific. Tundra and cedar identify why that change matters to validity.`,
    'Test: Violet and delta define an explicit prospective test with a decision rule and a falsifiable outcome.',
    'Reproducibility: Harbor and linen require a repeatable procedure, preserved artifacts, and an independently challengeable result.',
  ].join('\n')
  return { exam, reply }
}

test('PhD methodology exam is seeded, reproducible, and contains only the public case contract', () => {
  const first = buildCosUniversityPhdMethodologyExam('seed-a', 'ai_systems_research')
  const again = buildCosUniversityPhdMethodologyExam('seed-a', 'ai_systems_research')
  const other = buildCosUniversityPhdMethodologyExam('seed-b', 'ai_systems_research')
  assert.equal(first.manifestHash, again.manifestHash)
  assert.notEqual(first.manifestHash, other.manifestHash)
  assert.match(first.prompt, /UNSEEN PHD RESEARCH METHODOLOGY EXAM/)
  assert.match(first.prompt, /Do not invent observations/)
  assert.match(first.prompt, /Ground your analysis in this specific packet/)
  assert.deepEqual(Object.keys(first.packet).sort(), [
    'afterPercent', 'beforePercent', 'changedConditionAnchor', 'interventionAnchor', 'sampleSize',
  ])
  assert.equal(Object.prototype.hasOwnProperty.call(first, 'rubric'), false)
})

test('host scorer requires fresh provenance and section-bound packet evidence', () => {
  const { exam, reply } = groundedReply('seed-score')
  const pass = scoreCosUniversityPhdMethodologyExam(exam, reply, provenance('turn-pass'), TEST_RUBRIC)
  assert.equal(pass.passed, true, pass.reasons.join(','))

  const cached = scoreCosUniversityPhdMethodologyExam(exam, reply, {
    ...provenance('turn-cache'), semanticCache: true,
  }, TEST_RUBRIC)
  assert.equal(cached.passed, false)
  assert.ok(cached.reasons.includes('semantic_cache_used'))

  const wrongSection = reply.replace(
    `Claim: The ${exam.packet.interventionAnchor}`,
    `Claim: The intervention`,
  ).replace(
    'Threats:',
    `Threats: The ${exam.packet.interventionAnchor} is mentioned here instead.`,
  )
  const misplaced = scoreCosUniversityPhdMethodologyExam(exam, wrongSection, provenance('turn-misplaced'), TEST_RUBRIC)
  assert.equal(misplaced.passed, false)
  assert.ok(misplaced.reasons.includes('packet_intervention_missing_from_claim'))
})

test('concatenated values and cross-packet anchor stuffing cannot satisfy public packet binding', () => {
  const exam = buildCosUniversityPhdMethodologyExam('packet-attack', 'ai_systems_research')
  const attack = [
    'Claim: model-routing policy security training intervention production scheduling policy forecasting procedure sensor-calibration procedure 7%8%9%10%11%12%13%14%15%16%17% 18%19%20%21%22%23%24%25%26%27%28%29%30%31%32%33%34%35%36%37%38%39%40%41%42% 180181182183184185186187188189190191192193194195196197198199200 orchid granite.',
    'Design: amber quartz provide enough synthetic test words to satisfy only the fixture concepts but not substantive packet binding.',
    'Threats: logging pipeline self-selected measurement threshold workload shift instrument version tundra cedar are all stuffed together without analysis.',
    'Test: violet delta provide enough synthetic test words for this deliberately adversarial fixture response and nothing more.',
    'Reproducibility: harbor linen provide enough synthetic test words for this deliberately adversarial fixture response and nothing more.',
  ].join('\n')
  const score = scoreCosUniversityPhdMethodologyExam(exam, attack, provenance('turn-attack'), TEST_RUBRIC)
  assert.equal(score.passed, false)
  assert.ok(score.reasons.some(reason => reason.startsWith('packet_') || reason.startsWith('cross_packet_') || reason === 'suspicious_long_token'), score.reasons.join(','))
})

test('direct rejection is accepted, but unrelated negation cannot excuse an unsupported assertion', () => {
  const rejected = groundedReply('seed-negation', 'and the statement cerulean certainty is unsupported')
  const rejectionScore = scoreCosUniversityPhdMethodologyExam(rejected.exam, rejected.reply, provenance('turn-rejected'), TEST_RUBRIC)
  assert.equal(rejectionScore.passed, true, rejectionScore.reasons.join(','))

  const endorsed = groundedReply('seed-endorsement', 'and the design is not randomized, but cerulean certainty')
  const endorsementScore = scoreCosUniversityPhdMethodologyExam(endorsed.exam, endorsed.reply, provenance('turn-endorsed'), TEST_RUBRIC)
  assert.equal(endorsementScore.passed, false)
  assert.ok(endorsementScore.reasons.includes('unsupported_assertion:1'), endorsementScore.reasons.join(','))
})

test('production certification rubric is host-private, immutable to runtime, and has no committed fallback', () => {
  const scorer = file('lib/ai/cos/cosUniversityPhdMethodologyExam.ts')
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  const schema = file('supabase/migrations/20260910012000_cos_university_phd_methodology_exam_runs.sql')

  assert.doesNotMatch(scorer, /causality is proven|selection bias|confound|preregister/i)
  assert.match(runner, /from\('cos_university_phd_methodology_exam_rubrics'\)/)
  assert.match(runner, /validateCosUniversityPhdMethodologyRubric\(row\.rubric_json\)/)
  assert.match(runner, /methodology_private_rubric_unavailable/)
  assert.doesNotMatch(runner, /TEST_RUBRIC|fallbackRubric|defaultRubric/)
  assert.match(schema, /grant select on table public\.cos_university_phd_methodology_exam_rubrics to service_role/i)
  assert.doesNotMatch(schema, /grant[^;]*(?:insert|update|delete)[^;]*cos_university_phd_methodology_exam_rubrics/i)
  assert.doesNotMatch(schema, /insert\s+into\s+public\.cos_university_phd_methodology_exam_rubrics/i)
})

test('examiner identity is bound to the private rubric hash and candidate output cannot self-record evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.match(runner, /examinerActorId\(privateRubric\.hash\)/)
  assert.match(runner, /principalFingerprint: `\$\{COS_UNIVERSITY_PHD_METHODOLOGY_SCORER\}:\$\{row\.rubric_hash\}`/)
  assert.match(runner, /actorRole: 'methodology_examiner'/)
  assert.match(runner, /principalType: 'system'/)
  assert.match(runner, /recordHostCosUniversityPhdEvidence\(/)
  assert.match(runner, /evaluatorActorIds: \[row\.evaluator_actor_id\]/)
  assert.match(runner, /performerActorIds: \[row\.candidate_actor_id\]/)
  assert.match(runner, /authority: 'host_private_exam'/)
  assert.match(runner, /independent: true/)
  assert.doesNotMatch(file('app/api/admin/cos-university-phd/route.ts'), /recordHostCosUniversityPhdEvidence/)
})

test('methodology evidence is bound to the enrolled candidate model actually used for the exam turn', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.match(runner, /result\.provenance\.reasonerLabel/)
  assert.match(runner, /candidate\.actorRole === 'candidate'/)
  assert.match(runner, /candidate\.principalType === 'ai_model'/)
  assert.match(runner, /cosUniversityPhdActorIdentityEligible\(candidate, completedAt\)/)
  assert.match(runner, /candidate\.principalFingerprint === reasonerFingerprint/)
  assert.match(runner, /candidate_reasoner_principal_mismatch/)
  assert.match(runner, /fresh_candidate_execution_required/)
})

test('methodology attempts continue only to the existing A+ evidence target and respect failure resets', () => {
  const runner = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  assert.match(runner, /cosUniversityPhdDistinctPassesAfterLatestFailure\(/)
  assert.match(runner, /program\.aPlusDistinctPasses\.research_methodology_exam/)
  assert.match(runner, /stage: 'research_methodology_exam'/)
  assert.match(runner, /variantHash: row\.variant_hash/)
})

test('exam-run storage carries only rubric identity/hash, not private rubric values or raw answer material', () => {
  const schema = file('supabase/migrations/20260910012000_cos_university_phd_methodology_exam_runs.sql')
  const runsStart = schema.indexOf('create table if not exists public.cos_university_phd_methodology_exam_runs')
  const runsEnd = schema.indexOf('create index if not exists cos_university_phd_methodology_program_idx')
  const runTable = schema.slice(runsStart, runsEnd)
  assert.match(runTable, /rubric_id text not null references/)
  assert.match(runTable, /rubric_hash text not null/)
  assert.doesNotMatch(runTable, /rubric_json|raw_prompt|prompt text|reply text|graduated boolean|degree boolean/i)
  assert.match(schema, /alter table public\.cos_university_phd_methodology_exam_runs enable row level security/i)
  assert.match(schema, /grant select, insert, update on table public\.cos_university_phd_methodology_exam_runs to service_role/i)
})

test('PhD methodology cron is independently gated and cannot bypass the research boundary', () => {
  const route = file('app/api/cron/cos-university-phd-methodology-exam/route.ts')
  const vercel = JSON.parse(file('vercel.json')) as {
    env: Record<string, string>
    crons: Array<{ path: string; schedule: string }>
  }
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED !== 'true'/)
  assert.equal(vercel.env.COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-phd-methodology-exam'), {
    path: '/api/cron/cos-university-phd-methodology-exam', schedule: '11 * * * *',
  })
  assert.match(file('lib/ai/cos/cosUniversityPhdResearchPolicy.ts'), /independent_methodology_exam_required/)
})