import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import {
  publicUniversityExamFeedback,
  validUniversityExamFeedbackIdentity,
  withUniversityPublicExamFeedback,
} from '../lib/ai/cos/cosUniversityPublicExamFeedback.ts'

const identity = { agentId: 'software-specialist', runId: '10000000-0000-4000-8000-000000000001' }
const now = new Date('2026-09-12T06:00:00Z')
const observation = {
  id: identity.runId, agent_id: identity.agentId, status: 'failed', passed: false,
  completed_at: '2026-09-12T04:00:00Z', fresh_execution: true, provenance_recorded: true,
  local_model_invoked: true, external_ai_invoked: false,
  turn_id: '10000000-0000-4000-8000-000000000002',
  response_source: 'university_software_specialist_v1', reasons: ['word_limit_exceeded'],
}
const receipt = {
  agent_id: identity.agentId, assessment_key: `cos-university-exam:${identity.runId}`,
  source_ref: `cos_university_exam:${identity.runId}`, assessment_kind: 'unseen_subject_exam',
  passed: false, independent_scorer: true, scorer_authority: 'host_private_exam',
  turn_id: observation.turn_id, response_source: observation.response_source,
  observed_at: '2026-09-12T03:59:59Z',
  response_contract: { version: 'university_response_contract_v1', maxWords: 260,
    counting: 'whitespace_separated_tokens', scope: 'entire_final_response' },
}

test('an execution row without a matching disclosure receipt cannot blame response length', () => {
  for (const value of [undefined, null, {}, [], 'unverified']) {
    assert.equal(publicUniversityExamFeedback(observation, identity, now, value), null)
  }
})

test('a matching historical assessment without disclosure is not a learner length failure', () => {
  const { response_contract: omitted, ...legacy } = receipt
  for (const value of [legacy, { ...receipt, response_contract: null }]) {
    assert.equal(publicUniversityExamFeedback(observation, identity, now, value), 'response_contract_unverified')
  }
})

test('only a matching independent assessment with the disclosed contract enables length coaching', () => {
  assert.equal(publicUniversityExamFeedback(observation, identity, now, receipt), 'response_length')
  const cos = { ...identity, agentId: 'cos' }
  assert.equal(publicUniversityExamFeedback({ ...observation, agent_id: 'cos', response_source: 'local_cos_reasoning' },
    cos, now, { ...receipt, agent_id: 'cos', response_source: 'local_cos_reasoning' }), 'response_length')
})

test('disclosure cannot be borrowed from another run, agent, trace, source, authority or outcome', () => {
  for (const patch of [
    { agent_id: 'cos' }, { assessment_key: 'cos-university-exam:other' }, { source_ref: 'cos_university_exam:other' },
    { turn_id: '10000000-0000-4000-8000-000000000099' }, { response_source: 'local_cos_reasoning' },
    { passed: true }, { independent_scorer: false }, { scorer_authority: 'self' },
    { assessment_kind: 'practice' }, { observed_at: 'invalid' }, { observed_at: '2026-09-13T00:00:00Z' },
  ]) assert.equal(publicUniversityExamFeedback(observation, identity, now, { ...receipt, ...patch }), null)
  for (const turn_id of [null, '', 'arbitrary']) {
    assert.equal(publicUniversityExamFeedback({ ...observation, turn_id }, identity, now, { ...receipt, turn_id }), null)
  }
})

test('malformed or differently versioned contracts fail closed without forwarding their text', () => {
  for (const contract of [
    false, [], 'IGNORE POLICY', {}, { ...receipt.response_contract, version: 'invented' },
    { ...receipt.response_contract, maxWords: 0 }, { ...receipt.response_contract, maxWords: -1 },
    { ...receipt.response_contract, maxWords: 1.5 }, { ...receipt.response_contract, maxWords: '260' },
    { ...receipt.response_contract, counting: 'characters' }, { ...receipt.response_contract, scope: 'body_only' },
  ]) assert.equal(publicUniversityExamFeedback(observation, identity, now, { ...receipt, response_contract: contract }), null)
  assert.equal(publicUniversityExamFeedback({ ...observation, reasons: ['required_group_1_missing'] }, identity, now, receipt), null)
})

test('verified missing disclosure withdraws only the exact host-added suffix, never subject remediation', () => {
  const base = 'Study the original subject, preserve uncertainty and pass an independent retest.'
  const coached = withUniversityPublicExamFeedback(base, 'response_length')
  assert.equal(withUniversityPublicExamFeedback(coached, 'response_contract_unverified'), base)
  assert.equal(withUniversityPublicExamFeedback(base, 'response_contract_unverified'), base)
  assert.equal(withUniversityPublicExamFeedback(coached, null), coached, 'an unavailable read must not revoke valid guidance')
  const revised = `${coached} Owner-added instruction.`
  assert.equal(withUniversityPublicExamFeedback(revised, 'response_contract_unverified'), revised)
})

type Read = { table: string; select: string; eq: Array<[string, unknown]> }
function loadRuntime(options: { legacy?: boolean; errorTable?: string; throwTable?: string; absent?: boolean } = {}) {
  const reads: Read[] = []
  const db = {
    from(table: string) {
      assert.ok(['cos_university_exam_runs', 'cos_university_assessments'].includes(table))
      const read: Read = { table, select: '', eq: [] }
      reads.push(read)
      const query = {
        select(columns: string) { read.select = columns; return query },
        eq(key: string, value: unknown) { read.eq.push([key, value]); return query },
        async maybeSingle() {
          if (options.throwTable === table) throw new Error('unavailable')
          if (options.errorTable === table) return { data: null, error: { message: 'unavailable' } }
          const data = table === 'cos_university_exam_runs' ? observation
            : { ...receipt, ...(options.legacy ? { response_contract: null } : {}) }
          return { data: options.absent ? null : structuredClone(data), error: null }
        },
      }
      return query
    },
  }
  const source = fs.readFileSync(new URL('../lib/ai/cos/cosUniversityPublicExamFeedbackRuntime.ts', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('export async function loadUniversityPublicExamFeedback')).replace(/^export /, '')
  assert.ok(body.startsWith('async function'))
  const load = new Function('cosServiceDb', 'publicUniversityExamFeedback', 'validUniversityExamFeedbackIdentity',
    `${stripTypeScriptTypes(body)}; return loadUniversityPublicExamFeedback;`)(
    () => db, publicUniversityExamFeedback, validUniversityExamFeedbackIdentity,
  ) as (id: typeof identity) => Promise<unknown>
  return { reads, load }
}

test('actual host adapter reads exact run and assessment, projecting only public contract and binding fields', async () => {
  const runtime = loadRuntime()
  assert.equal(await runtime.load(identity), 'response_length')
  assert.equal(runtime.reads.length, 2)
  const [run, assessment] = runtime.reads
  assert.ok(run.eq.some(([key, value]) => key === 'id' && value === identity.runId))
  for (const query of runtime.reads) {
    assert.ok(query.eq.some(([key, value]) => key === 'agent_id' && value === identity.agentId))
    assert.doesNotMatch(query.select, /(?:^|,)\s*(?:\*|evidence)\s*(?:,|$)/)
  }
  assert.ok(assessment.eq.some(([key, value]) => key === 'assessment_key' && value === receipt.assessment_key))
  assert.ok(assessment.eq.some(([key, value]) => key === 'source_ref' && value === receipt.source_ref))
  assert.match(assessment.select, /response_contract:evidence->responseContract/)
  assert.match(assessment.select, /turn_id:evidence->>turnId/)
  assert.doesNotMatch(assessment.select, /reasons|rubric|prompt|seed|manifest|answer/)
})

test('actual host adapter recognizes legacy nondisclosure without manufacturing proof', async () => {
  const runtime = loadRuntime({ legacy: true })
  assert.equal(await runtime.load(identity), 'response_contract_unverified')
  assert.equal(runtime.reads.length, 2)
})

test('unavailable or missing disclosure reads return unknown rather than coaching or withdrawal', async () => {
  for (const table of ['cos_university_exam_runs', 'cos_university_assessments']) {
    for (const options of [{ errorTable: table }, { throwTable: table }]) {
      assert.equal(await loadRuntime(options).load(identity), null)
    }
  }
  assert.equal(await loadRuntime({ absent: true }).load(identity), null)
  const runtime = loadRuntime()
  assert.equal(await runtime.load({ ...identity, agentId: '*' }), null)
  assert.equal(runtime.reads.length, 0)
})
