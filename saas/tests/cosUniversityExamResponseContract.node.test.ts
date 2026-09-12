import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { universityExamResponseContract, universityIndependentLearnerPrompt } from '../lib/ai/cos/cosUniversityExamResponseContract.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const exam = Object.freeze({ prompt: 'Compare the evidentiary roles of these two supplied historical sources.',
  rubric: Object.freeze({ maxWords: 260, requiredGroups: [['evidence']], forbiddenTerms: ['private-scorer-sentinel'], exactPatterns: [] }),
  target: Object.freeze({ kind: 'subject', subjectId: 'history_culture_philosophy_religion' }),
  manifestHash: 'a'.repeat(64), profile: 'fixture-profile', scorerVersion: 'fixture-scorer' })

test('declared word ceiling is exact and does not expose private criteria or mutate the canonical case', () => {
  const before = JSON.stringify(exam)
  const prompt = universityIndependentLearnerPrompt(exam)
  assert.ok(prompt.startsWith(exam.prompt + '\n\n'))
  assert.match(prompt, /at most 260 words/)
  assert.match(prompt, /including headings and numbered labels/)
  assert.match(prompt, /separated by whitespace/)
  assert.doesNotMatch(prompt, /private-scorer-sentinel|requiredGroups|forbiddenTerms|exactPatterns|fixture-scorer/)
  assert.equal(JSON.stringify(exam), before)
  assert.deepEqual(universityExamResponseContract(exam), { version: 'university_response_contract_v1', maxWords: 260,
    counting: 'whitespace_separated_tokens', scope: 'entire_final_response' })
})

test('response constraints are localized for all five supported examination languages', () => {
  const phrases = { en: 'at most 150 words', es: 'máximo de 150 palabras', pt: 'no máximo 150 palavras', pl: 'najwyżej 150 słów', ru: 'не более 150 слов' }
  for (const [language, phrase] of Object.entries(phrases)) {
    const prompt = universityIndependentLearnerPrompt({ ...exam, rubric: { maxWords: 150 }, target: { kind: 'language', language } })
    assert.ok(prompt.includes(phrase))
    assert.ok(prompt.startsWith(exam.prompt))
  }
  assert.throws(() => universityIndependentLearnerPrompt({ ...exam, target: { kind: 'language', language: '__proto__' } }), /response_language_invalid/)
})

test('missing limits preserve input and malformed limits fail closed instead of silently changing the ceiling', () => {
  assert.equal(universityIndependentLearnerPrompt({ ...exam, rubric: {} }), exam.prompt)
  assert.equal(universityExamResponseContract({ ...exam, rubric: {} }), null)
  for (const maxWords of [0, -1, 1.5, NaN, Infinity, '260', null]) {
    assert.throws(() => universityIndependentLearnerPrompt({ ...exam, rubric: { maxWords } } as any), /word_limit_invalid/)
  }
})

function actualScorer() {
  const source = process.env.UNIVERSITY_SCORER_PROOF_SOURCE
    ? fs.readFileSync(process.env.UNIVERSITY_SCORER_PROOF_SOURCE, 'utf8')
    : read('lib/ai/cos/cosUniversityIndependentExam.ts')
  const start = source.indexOf('export function scoreCosUniversityBlindExam(')
  const end = source.indexOf('\nfunction freshIndependent(', start)
  assert.ok(start >= 0 && end > start)
  const executable = stripTypeScriptTypes(source.slice(start, end).replace('export function ', 'function '))
  const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return new Function('normalize', 'words', 'hasAny', 'languageMarker', `${executable}; return scoreCosUniversityBlindExam;`)(
    normalize, (text: string) => text.trim().match(/\S+/g)?.length ?? 0,
    (text: string, terms: string[]) => terms.some(term => normalize(text).includes(normalize(term))),
    () => /./,
  )
}

test('actual unchanged scorer still rejects the same over-limit answer and enforces all substantive groups', () => {
  const score = actualScorer()
  const provenance = { handled: true, localReasoning: true, externalAi: false, semanticCache: false, turnId: 'fixture-turn' }
  const before = JSON.stringify(exam)
  universityIndependentLearnerPrompt(exam)
  assert.deepEqual(score(exam, Array(261).fill('evidence').join(' '), provenance), { passed: false, reasons: ['word_limit_exceeded'] })
  assert.deepEqual(score(exam, Array(260).fill('evidence').join('\n'), provenance), { passed: true, reasons: [] })
  assert.deepEqual(score(exam, 'short but missing the substantive concept', provenance), { passed: false, reasons: ['required_group_1_missing'] })
  assert.equal(JSON.stringify(exam), before)
})

/** Actual source functions, with only external model/database/turn I/O injected. */
async function runActualExam(agentId: string, selectedExam: Record<string, any> = exam) {
  const source = process.env.UNIVERSITY_RESPONSE_RUNNER_BASELINE
    ? fs.readFileSync(process.env.UNIVERSITY_RESPONSE_RUNNER_BASELINE, 'utf8')
    : read('lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  const start = source.indexOf('async function executeBoundExam(')
  const end = source.indexOf('\nasync function runTarget(', start)
  assert.ok(start >= 0 && end > start)
  const row = { id: '20000000-0000-4000-8000-000000000002', seed: 'fixture-seed',
    manifest_hash: exam.manifestHash, profile: exam.profile, scorer_version: exam.scorerVersion }
  const sent: any[] = [], assessments: any[] = [], writes: any[] = [], embeddings: string[] = []
  const db = { from(table: string) {
    assert.equal(table, 'cos_university_exam_runs')
    let pending: any
    const query: any = { update(value: any) { pending = value; return query },
      eq(key: string, value: unknown) { assert.equal(key, 'id'); assert.equal(value, row.id); return query },
      then(resolve: any, reject: any) { writes.push(pending); return Promise.resolve({ error: null }).then(resolve, reject) } }
    return query
  } }
  const reply = Array(261).fill('evidence').join(' ')
  const dependencies: Record<string, any> = {
    cosServiceDb: () => db,
    buildCosUniversityBlindExam: () => selectedExam,
    executeBoundAgentExam: async (input: any) => {
      sent.push(input)
      return { reply, execution: { agentId, runId: row.id, manifestHash: exam.manifestHash, turnId: 'fixture-turn' } }
    },
    scoreCosUniversityBlindExam: (scoredExam: unknown, ...args: any[]) => {
      assert.equal(scoredExam, selectedExam, 'do not change the object supplied to the real scorer')
      return actualScorer()(scoredExam, ...args)
    },
    recordCosUniversityAssessment: async (input: any) => { assessments.push(input); return true },
    COS_UNIVERSITY_EXAM_PROFILE: exam.profile, COS_UNIVERSITY_EXAM_SCORER: exam.scorerVersion,
    SOFTWARE_CAPSTONE_RUNTIME: 'university_software_specialist_v1', DEFAULT_AGENT_ID: 'cos',
    universityExamValidUntil: () => '2026-10-01T00:00:00Z',
    universityIndependentLearnerPrompt, universityExamResponseContract,
    beginEvidenceSourceUseTurn: () => {}, flushCapturedEvidenceSourceUse: () => {},
    peekEvidenceSourceUseTurnId: () => 'fixture-turn',
    ensureLocalInferenceRuntimeReady: async () => {}, generateLocalEmbedding: async (prompt: string) => { embeddings.push(prompt) },
    tryCOSFirstAnswer: async (input: any) => { sent.push(input); return { handled: true, reply, confidence: .5,
      provenance: { localModelInvoked: true, externalAiInvoked: false, responseSource: 'local_cos_reasoning' } } },
    decideCosTurnExperience: () => ({ routeClass: 'fixture', evidence: {} }), recordTurnLearningEnrichment: () => {},
    attachTurnOutcome: async () => {}, asRecord: (value: unknown) => value || {},
  }
  const execute = new Function(...Object.keys(dependencies), `${stripTypeScriptTypes(source.slice(start, end))}; return executeExam;`)(...Object.values(dependencies))
  const result = await execute(agentId, row, exam.target, new Date())
  return { result, sent, assessments, writes, embeddings }
}

for (const agentId of ['cos', 'software-specialist']) {
  test(`actual ${agentId} executor receives the existing word ceiling before inference and retains an honest failure`, async () => {
    const result = await runActualExam(agentId)
    assert.equal(result.sent.length, 1)
    assert.match(result.sent[0].prompt, /at most 260 words/)
    assert.doesNotMatch(result.sent[0].prompt, /private-scorer-sentinel/)
    assert.equal(result.result.status, 'failed')
    assert.deepEqual(result.result.reasons, ['word_limit_exceeded'])
    assert.equal(result.assessments.length, 1)
    assert.equal(result.assessments[0].passed, false)
    assert.deepEqual(result.assessments[0].evidence.responseContract, universityExamResponseContract(exam))
    assert.equal(result.writes.at(-1).passed, false)
    if (agentId === 'software-specialist') assert.equal(result.sent[0].manifestHash, exam.manifestHash)
    else assert.ok(result.embeddings.every(prompt => prompt === result.sent[0].prompt))
  })
}

test('invalid response constraints fail before either learner is called or receives academic credit', async () => {
  for (const agent of ['cos', 'software-specialist']) {
    const result = await runActualExam(agent, { ...exam, rubric: { ...exam.rubric, maxWords: 0 } })
    assert.equal(result.sent.length, 0)
    assert.equal(result.assessments.length, 0)
    assert.equal(result.result.status, 'error')
    assert.equal(result.result.passed, null)
  }
})
