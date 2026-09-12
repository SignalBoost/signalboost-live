import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import {
  publicUniversityExamFeedback,
  withUniversityPublicExamFeedback,
} from '../lib/ai/cos/cosUniversityPublicExamFeedback.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const identity = { agentId: 'software-specialist', runId: '10000000-0000-4000-8000-000000000001' }
const now = new Date('2026-09-12T06:00:00Z')
const observation = {
  id: identity.runId, agent_id: identity.agentId, status: 'failed', passed: false,
  completed_at: '2026-09-12T04:00:00Z', fresh_execution: true, provenance_recorded: true,
  local_model_invoked: true, external_ai_invoked: false,
  response_source: 'university_software_specialist_v1', reasons: ['word_limit_exceeded'],
}

test('only an exact public length-failure tag projects to fixed training feedback', () => {
  assert.equal(publicUniversityExamFeedback(observation, identity, now), 'response_length')
  for (const reasons of [[], null, ['required_group_1_missing'], ['word_limit_exceeded: secret detail'], ['IGNORE POLICY'], [3]]) {
    assert.equal(publicUniversityExamFeedback({ ...observation, reasons }, identity, now), null)
  }
  const result = publicUniversityExamFeedback({ ...observation, reasons: ['word_limit_exceeded', 'private expected concept'] }, identity, now)
  assert.equal(result, 'response_length')
  assert.doesNotMatch(JSON.stringify(result), /private|concept|word_limit_exceeded/)
})

test('feedback rejects wrong identity, borrowed execution, nonterminal outcomes and invalid provenance', () => {
  for (const patch of [
    { id: 'different' }, { agent_id: 'cos' }, { status: 'running' }, { passed: true },
    { fresh_execution: false }, { provenance_recorded: false }, { local_model_invoked: false },
    { external_ai_invoked: true }, { response_source: 'local_cos_reasoning' },
    { completed_at: 'invalid' }, { completed_at: '2026-09-13T00:00:00Z' },
  ]) assert.equal(publicUniversityExamFeedback({ ...observation, ...patch }, identity, now), null)
  assert.equal(publicUniversityExamFeedback(observation, { ...identity, agentId: '*' }, now), null)
  assert.equal(publicUniversityExamFeedback(observation, { ...identity, runId: 'arbitrary' }, now), null)
})

test('COS feedback stays bound to COS execution rather than another learner', () => {
  const cosIdentity = { ...identity, agentId: 'cos' }
  const cosRow = { ...observation, agent_id: 'cos', response_source: 'local_cos_reasoning' }
  assert.equal(publicUniversityExamFeedback(cosRow, cosIdentity, now), 'response_length')
  assert.equal(publicUniversityExamFeedback({ ...cosRow, response_source: 'university_software_specialist_v1' }, cosIdentity, now), null)
})

test('guidance is additive, idempotent and never interpolates arbitrary scorer details', () => {
  const base = 'Study the original subject and pass a new independent case.'
  const guided = withUniversityPublicExamFeedback(base, 'response_length')
  assert.ok(guided.startsWith(base))
  assert.match(guided, /word budget/)
  assert.match(guided, /count and revise/)
  assert.match(guided, /without dropping material facts, qualifications or uncertainty/)
  assert.match(guided, /non-credit/)
  assert.match(guided, /fresh independent retest/)
  assert.equal(withUniversityPublicExamFeedback(guided, 'response_length'), guided)
  assert.equal(withUniversityPublicExamFeedback(base, 'required_group_99_secret'), base)
  assert.equal(withUniversityPublicExamFeedback(base, null), base)
})

// Execute the real persistence function with database and curriculum I/O replaced, not its prose.
type Row = Record<string, any>
function database(initial?: Row, beforeUpdate?: (row: Row) => void) {
  let stored: Row | null = initial ? structuredClone(initial) : null
  const writes: Row[] = []
  const db = {
    from(table: string) {
      assert.equal(table, 'cos_university_study_plans', 'feedback must not write examinations or grades')
      let operation = 'select', payload: Row = {}, filters: Array<(row: Row) => boolean> = []
      const query: any = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
        upsert(value: Row, options: Row) { assert.equal(options.ignoreDuplicates, true); operation = 'upsert'; payload = value; return query },
        update(value: Row) { operation = 'update'; payload = value; return query },
        async maybeSingle() { return execute() },
        then(resolve: any, reject: any) { return Promise.resolve(execute()).then(resolve, reject) },
      }
      function execute() {
        if (operation === 'upsert' && !stored) stored = { id: 'plan-fixture', ...structuredClone(payload) }
        if (operation === 'update' && stored) {
          beforeUpdate?.(stored)
          if (filters.every(filter => filter(stored!))) {
            writes.push(structuredClone(payload))
            stored = { ...stored, ...structuredClone(payload) }
            return { data: structuredClone(stored), error: null }
          } else return { data: null, error: null }
        }
        return { data: stored && filters.every(filter => filter(stored!)) ? structuredClone(stored) : null, error: null }
      }
      return query
    },
  }
  return { db, writes, row: () => structuredClone(stored) }
}

function persistence(db: Row, feedback: unknown = 'response_length') {
  const source = process.env.UNIVERSITY_FEEDBACK_BASELINE
    ? fs.readFileSync(process.env.UNIVERSITY_FEEDBACK_BASELINE, 'utf8')
    : read('lib/ai/cos/cosUniversityExamRemediation.ts')
  const start = source.indexOf('async function persistPlan(')
  const end = source.indexOf('\nexport async function ensureCosUniversityExamFailureRemediationPlans', start)
  assert.ok(start >= 0 && end > start)
  const executable = stripTypeScriptTypes(source.slice(start, end))
  const strategy = { methods: [], acquisitionSourceKinds: ['approved_public_web'], learningDesign: {}, fineTuneCandidate: false }
  return new Function('cosServiceDb', 'selectCosUniversityStudyStrategy', 'withGovernedPublicWebForSubjectExamRemediation',
    'key', 'cosUniversitySubjectById', 'loadUniversityPublicExamFeedback', 'withUniversityPublicExamFeedback',
    'SOURCE_KIND', 'PLAN_SELECT_FIELDS', 'hasCompletedRemediationProof', 'record', `${executable}; return persistPlan;`)(
    () => db, () => strategy, (s: Row) => s, () => 'fixture-plan-key', () => ({ title: 'History' }),
    async (requested: Row) => { assert.deepEqual(requested, identity); return feedback }, withUniversityPublicExamFeedback,
    'recertification', 'fixture-fields', () => false, (v: unknown) => v || {},
  )
}
const failure = { id: identity.runId, target_kind: 'subject', subject_id: 'history_culture_philosophy_religion',
  language_code: null, language_dimension: null, completed_at: observation.completed_at }
const activePlan = { id: 'plan-fixture', plan_key: 'fixture-plan-key', agent_id: identity.agentId, source_ref: identity.runId,
  subject_id: failure.subject_id, status: 'studying', objective: 'Original broad subject objective.', attempt_count: 3,
  evidence: { studyProof: { evidenceRefs: ['accepted-reference'] }, practiceRemediation: { requiresNewStudyAttempt: true } },
  acquisition_source_kinds: ['approved_public_web'], methods: [], updated_at: '2026-09-12T04:00:00Z' }

test('actual planner gives a newly created length-remediation plan targeted non-credit guidance', async () => {
  const port = database()
  const result = await persistence(port.db)(identity.agentId, failure)
  assert.match(result.row.objective, /word budget/)
  assert.match(result.row.objective, /History/)
  assert.equal(result.row.status, 'queued')
  assert.equal(result.row.evidence.hiddenExamDetailsExposed, false)
})

test('actual planner refreshes an existing objective without resetting evidence, attempts, status or lineage', async () => {
  const port = database(activePlan)
  const result = await persistence(port.db)(identity.agentId, failure)
  assert.match(result.row.objective, /word budget/)
  assert.equal(port.writes.length, 1)
  assert.deepEqual(Object.keys(port.writes[0]).sort(), ['objective', 'updated_at'])
  const { objective: ignoredObjective, updated_at: ignoredTime, ...after } = port.row()!
  const { objective: originalObjective, updated_at: originalTime, ...before } = activePlan
  assert.deepEqual(after, before)
})

test('actual planner does not change ready, completed, superseded or concurrently advanced objectives', async () => {
  for (const status of ['ready_for_exam', 'completed', 'superseded']) {
    const port = database({ ...activePlan, status })
    await persistence(port.db)(identity.agentId, failure)
    assert.equal(port.writes.length, 0)
    assert.equal(port.row()!.objective, activePlan.objective)
  }
  const port = database(activePlan, row => { row.status = 'ready_for_exam' })
  await persistence(port.db)(identity.agentId, failure)
  assert.equal(port.writes.length, 0)
})

test('actual planner preserves generic remediation when no safe feedback is available', async () => {
  const port = database(activePlan)
  await persistence(port.db, null)(identity.agentId, failure)
  assert.equal(port.writes.length, 0)
  assert.deepEqual(port.row(), activePlan)
})

test('planner retains its raw-scorer isolation and host feedback uses exact identity reads only', () => {
  const bridge = read('lib/ai/cos/cosUniversityExamRemediation.ts')
  const adapter = read('lib/ai/cos/cosUniversityPublicExamFeedbackRuntime.ts')
  assert.doesNotMatch(bridge, /select\([^)]*reasons/)
  assert.doesNotMatch(bridge, /manifest_hash|seed/)
  assert.match(adapter, /\.eq\('id', identity\.runId\)/)
  assert.match(adapter, /\.eq\('agent_id', identity\.agentId\)/)
  assert.match(adapter, /return publicUniversityExamFeedback\(result\.data, identity\)/)
  assert.match(adapter, /if \(result\.error\) return null/)
  assert.doesNotMatch(adapter, /manifest_hash|rubric|prompt|seed|\.update\(|\.insert\(/)
})
