import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import {
  publicUniversityExamFeedback,
  validUniversityExamFeedbackIdentity,
  withUniversityPublicExamFeedback,
} from '../lib/ai/cos/cosUniversityPublicExamFeedback.ts'

const identity = { agentId: 'software-specialist', runId: '10000000-0000-4000-8000-000000000001' }
const now = new Date('2026-09-12T06:00:00Z')
const contract = { version: 'university_response_contract_v1', maxWords: 260,
  counting: 'whitespace_separated_tokens', scope: 'entire_final_response' }
const observation = { id: identity.runId, agent_id: identity.agentId, status: 'failed', passed: false,
  completed_at: '2026-09-12T04:00:00Z', fresh_execution: true, provenance_recorded: true,
  local_model_invoked: true, external_ai_invoked: false,
  response_source: 'university_software_specialist_v1', reasons: ['word_limit_exceeded'] }
const proof = { assessment_key: `cos-university-exam:${identity.runId}`, agent_id: identity.agentId,
  assessment_kind: 'unseen_subject_exam', passed: false, independent_scorer: true,
  scorer_authority: 'host_private_exam', source_ref: `cos_university_exam:${identity.runId}`,
  observed_at: '2026-09-12T03:59:59Z', response_contract: contract }
const decide = (evidence: unknown, row: Record<string, unknown> = observation) =>
  publicUniversityExamFeedback({ ...row, response_contract_evidence: evidence }, identity, now)

test('a failed run without authoritative disclosure evidence cannot establish disobedience', () => {
  for (const value of [undefined, null, {}, 'university_response_contract_v1', [], { response_contract: contract }])
    assert.equal(decide(value), null)
})

test('an exact independently scored failure under the public contract permits targeted feedback', () => {
  assert.equal(decide(proof), 'response_length')
  const cos = { ...identity, agentId: 'cos' }
  assert.equal(publicUniversityExamFeedback({ ...observation, agent_id: 'cos', response_source: 'local_cos_reasoning',
    response_contract_evidence: { ...proof, agent_id: 'cos' } }, cos, now), 'response_length')
})

test('an authoritative legacy failure without disclosure is a harness issue, not learner noncompliance', () => {
  assert.equal(decide({ ...proof, response_contract: null }), 'undisclosed_response_length')
  const { response_contract: removed, ...legacy } = proof
  assert.equal(decide(legacy), 'undisclosed_response_length')
  assert.equal(withUniversityPublicExamFeedback('Keep the subject objective.', 'undisclosed_response_length'), 'Keep the subject objective.')
})

for (const [label, patch] of Object.entries({
  foreignAgent: { agent_id: 'cos' }, foreignRun: { assessment_key: 'cos-university-exam:another-run' },
  foreignSource: { source_ref: 'cos_university_exam:another-run' }, wrongKind: { assessment_kind: 'production_transfer' },
  passedAssessment: { passed: true }, selfScored: { independent_scorer: false },
  wrongAuthority: { scorer_authority: 'owner' }, missingTime: { observed_at: null },
  invalidTime: { observed_at: 'invalid' }, futureTime: { observed_at: '2027-01-01T00:00:00Z' },
})) test(`disclosure proof rejects ${label}`, () => { assert.equal(decide({ ...proof, ...patch }), null) })

for (const [label, response_contract] of Object.entries({
  wrongVersion: { ...contract, version: 'future' }, wrongScope: { ...contract, scope: 'body_only' },
  wrongCounting: { ...contract, counting: 'model_tokens' }, missingLimit: { ...contract, maxWords: undefined },
  zeroLimit: { ...contract, maxWords: 0 }, fractionalLimit: { ...contract, maxWords: 2.5 },
  textLimit: { ...contract, maxWords: '260' }, unsafeLimit: { ...contract, maxWords: Number.MAX_SAFE_INTEGER + 1 },
  scalarContract: true, arrayContract: [contract],
})) test(`disclosure contract rejects ${label}`, () => { assert.equal(decide({ ...proof, response_contract }), null) })

test('disclosure never bypasses failure, identity or execution proof and never reveals raw reasons', () => {
  for (const patch of [{ passed: true }, { status: 'running' }, { fresh_execution: false },
    { provenance_recorded: false }, { external_ai_invoked: true }, { agent_id: 'cos' },
    { reasons: ['required_group_1_missing'] }]) assert.equal(decide(proof, { ...observation, ...patch }), null)
  const result = decide(proof, { ...observation, reasons: ['private concept', 'word_limit_exceeded'] })
  assert.equal(result, 'response_length')
  assert.doesNotMatch(JSON.stringify(result), /private|concept|260/)
})

test('legacy reconciliation removes only the exact generated suffix and is idempotent', () => {
  const original = 'Preserve all subject instruction and uncertainty.'
  const guided = withUniversityPublicExamFeedback(original, 'response_length')
  assert.notEqual(guided, original)
  assert.equal(withUniversityPublicExamFeedback(guided, 'undisclosed_response_length'), original)
  assert.equal(withUniversityPublicExamFeedback(original, 'undisclosed_response_length'), original)
  assert.equal(withUniversityPublicExamFeedback(`${guided} Owner instruction.`, 'undisclosed_response_length'), `${guided} Owner instruction.`)
  assert.equal(withUniversityPublicExamFeedback(guided, null), guided, 'read failures must not erase supported coaching')
})

type Row = Record<string, unknown>
function runtime(options: { exam?: Row | null; assessment?: Row | null; errorTable?: string; throwTable?: string; noDb?: boolean } = {}) {
  const calls: { table: string; selected: string; filters: [string, unknown][] }[] = []
  const db = { from(table: string) {
    const call = { table, selected: '', filters: [] as [string, unknown][] }; calls.push(call)
    const q = {
      select(value: string) { call.selected = value; return q },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return q },
      async maybeSingle() {
        if (options.throwTable === table) throw new Error('isolated_read_failure')
        if (options.errorTable === table) return { data: null, error: new Error('isolated_read_failure') }
        assert.ok(['cos_university_exam_runs', 'cos_university_assessments'].includes(table))
        const row: Row | null | undefined = table === 'cos_university_exam_runs'
          ? (Object.hasOwn(options, 'exam') ? options.exam : observation)
          : (Object.hasOwn(options, 'assessment') ? options.assessment : proof)
        const data = row && call.filters.every(([key, value]) => row[key] === value) ? structuredClone(row) : null
        return { data, error: null }
      },
    }; return q
  } }
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityPublicExamFeedbackRuntime.ts', import.meta.url), 'utf8')
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '').replace(/^export\s+/gm, '')
  const load = new Function('cosServiceDb', 'publicUniversityExamFeedback', 'validUniversityExamFeedbackIdentity',
    `${js}; return loadUniversityPublicExamFeedback;`)(() => options.noDb ? null : db,
    (row: unknown, id: typeof identity) => publicUniversityExamFeedback(row, id, now), validUniversityExamFeedbackIdentity)
  return { load, calls }
}

test('actual runtime reads the exact authoritative assessment and only its public contract projection', async () => {
  const h = runtime()
  assert.equal(await h.load(identity), 'response_length')
  assert.equal(h.calls.length, 2)
  const query = h.calls.find(call => call.table === 'cos_university_assessments')!
  assert.ok(query)
  assert.match(query.selected, /response_contract:evidence->responseContract/)
  assert.doesNotMatch(query.selected, /(?:^|,)evidence(?:,|$)|rubric|reasons|prompt|seed/)
  for (const pair of [['assessment_key', proof.assessment_key], ['agent_id', identity.agentId], ['source_ref', proof.source_ref],
    ['assessment_kind', 'unseen_subject_exam'], ['passed', false], ['independent_scorer', true], ['scorer_authority', 'host_private_exam']])
    assert.ok(query.filters.some(filter => JSON.stringify(filter) === JSON.stringify(pair)))
})

test('actual runtime distinguishes legacy disclosure absence from missing or foreign proof', async () => {
  assert.equal(await runtime({ assessment: { ...proof, response_contract: null } }).load(identity), 'undisclosed_response_length')
  for (const assessment of [null, { ...proof, agent_id: 'cos' }, { ...proof, passed: true },
    { ...proof, independent_scorer: false }, { ...proof, source_ref: 'foreign' }])
    assert.equal(await runtime({ assessment }).load(identity), null)
})

test('actual runtime fails closed on unavailable reads without inventing feedback or writing evidence', async () => {
  for (const table of ['cos_university_exam_runs', 'cos_university_assessments']) {
    assert.equal(await runtime({ errorTable: table }).load(identity), null)
    assert.equal(await runtime({ throwTable: table }).load(identity), null)
  }
  const absent = runtime({ noDb: true }); assert.equal(await absent.load(identity), null); assert.equal(absent.calls.length, 0)
  const invalid = runtime(); assert.equal(await invalid.load({ ...identity, runId: 'bad' }), null); assert.equal(invalid.calls.length, 0)
})
