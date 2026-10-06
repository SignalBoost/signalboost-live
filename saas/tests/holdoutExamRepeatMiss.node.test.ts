// saas/tests/holdoutExamRepeatMiss.node.test.ts
//
// Production 2026-10-05 18:54 your time onward: no exam started. 24 holdout exam sets sat at `requested`,
// `exam_items_incomplete:1/4`, attempts 0 - one question per set never got written, that failure was never charged, so
// the sets never exhausted and filled all 24 slots of the evaluator's lookahead. Now each missing item is named with
// why (the quality rule its draft broke, or the teacher error), and the SAME item missing on consecutive passes charges
// an attempt, so the set exhausts like any other and the existing revival retries it after its cool-off.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  fillRequestedHoldoutExamSets,
  holdoutExamItemRejection,
  incompleteExamItemOf,
  parseHoldoutExamItem,
} from '../lib/ai/cos/cosUniversityHoldoutExamItems.ts'

const H = (c: string) => c.repeat(64)

function fakeDb(initial: { sets?: any[]; items?: any[]; runs?: any[] } = {}) {
  const tables: Record<string, any[]> = {
    cos_university_holdout_exam_sets: [...(initial.sets || [])],
    cos_university_holdout_exam_items: [...(initial.items || [])],
    cos_university_mass_distillation_batch_runs: [...(initial.runs || [])],
  }
  const from = (name: string) => {
    const rows = tables[name]
    const filters: Array<(row: any) => boolean> = []
    let limitN = Infinity
    const q: any = {
      select: () => q,
      in: (col: string, values: any[]) => { filters.push(row => values.includes(row[col])); return q },
      eq: (col: string, value: any) => { filters.push(row => row[col] === value); return q },
      lt: (col: string, value: any) => { filters.push(row => (row[col] ?? 0) < value); return q },
      order: () => q,
      limit: (n: number) => { limitN = n; return q },
      maybeSingle: async () => ({ data: rows.filter(r => filters.every(f => f(r)))[0] || null, error: null }),
      then: (resolve: any) => resolve({ data: rows.filter(r => filters.every(f => f(r))).slice(0, limitN), error: null }),
      upsert: async (value: any, opts: any) => {
        for (const v of Array.isArray(value) ? value : [value]) {
          const keys = String(opts?.onConflict || '').split(',')
          const existing = rows.find(r => keys.every(k => r[k] === v[k]))
          if (!existing) rows.push({ ...v })
          else if (!opts?.ignoreDuplicates) Object.assign(existing, v)
        }
        return { error: null }
      },
      update: (patch: any) => {
        const u: any = {
          eq: (col: string, value: any) => { filters.push(row => row[col] === value); return u },
          then: (resolve: any) => { for (const r of rows.filter(r => filters.every(f => f(r)))) Object.assign(r, patch); resolve({ error: null }) },
        }
        return u
      },
    }
    return q
  }
  return { from, tables }
}

const TEACHER_ENV = {
  HF_TOKEN: 'x'.repeat(30),
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL: 'deepseek-chat',
  DEEPSEEK_API_KEY: 'k'.repeat(30),
}
const GOOD = 'QUESTION: A team sets its reorder point from average demand alone and ignores how much demand varies week to week. What failure does this invite, and which element is missing?\nANSWER KEY: Stockouts whenever demand runs above average; safety stock is the missing element.'
const YES_NO = 'QUESTION: Should a team set its reorder point from average demand alone when demand varies a lot week to week?\nANSWER KEY: No.'

/** The teacher answers well for every essay except the one containing `bad`, for which it returns `badReply`. */
function teacher(bad: string, badReply: string | 'http500') {
  return (async (_url: string, init: any) => {
    const body = String(init?.body || '')
    if (body.includes(bad)) {
      if (badReply === 'http500') return new Response('upstream down', { status: 500 })
      return new Response(JSON.stringify({ id: 'r', model: 'm', choices: [{ message: { content: badReply } }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ id: 'r', model: 'm', choices: [{ message: { content: GOOD } }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

const rows = [
  { text: 'e1', item_hash: H('1'), prompt: 'p', response: 'Essay one about reorder points and demand variability.' },
  { text: 'e2', item_hash: H('2'), prompt: 'p', response: 'Essay two STUCKESSAY about safety stock.' },
]
const oneSet = () => fakeDb({
  sets: [{ candidate_id: 'mass:s', trained_artifact_hash: H('a'), status: 'requested', attempts: 0, last_error: null }],
  runs: [{ candidate_id: 'mass:s', subject_id: 'Business & Operations', trained_artifact_hash: H('a'),
    holdout_data_ref: `hf://datasets/cadomos/itmounts-training-x@${'a'.repeat(40)}#holdout`, holdout_manifest_hash: H('d') }],
})
const pass = (db: any, fetchImpl: typeof fetch, readRows = rows) =>
  fillRequestedHoldoutExamSets({ db, env: TEACHER_ENV, fetchImpl, readRows: (async () => readRows) as any })

test('every quality rule is named, and the parser accepts and rejects exactly as before', () => {
  assert.equal(holdoutExamItemRejection(GOOD), null)
  assert.ok(parseHoldoutExamItem(GOOD))
  const cases: Array<[string, string]> = [
    ['Here is a teaching example about bottlenecks.', 'no_question_answer_key_lines'],
    ['QUESTION: Why?\nANSWER KEY: Because.', 'too_short'],
    ['QUESTION: Describe the general history of inventory management in modern firms.\nANSWER KEY: It evolved.', 'not_a_question'],
    ['QUESTION: Calculate the reorder point for a store with demand of 20 units per day and a 7 day lead time?\nANSWER KEY: 140 units.', 'computation_ask'],
    ['QUESTION: What is the economic order quantity for this store with its stated demand and costs?\nANSWER KEY: EOQ = \\sqrt{2DS/H} = 400 units.', 'formula_answer'],
    [YES_NO, 'yes_no_answer'],
    ['QUESTION: Based on the example above, what is the reorder point?\nANSWER KEY: 140 units.', 'self_reference'],
  ]
  for (const [reply, rule] of cases) {
    assert.equal(holdoutExamItemRejection(reply), rule, reply)
    assert.equal(parseHoldoutExamItem(reply), null, reply)
  }
})

test('the recorded missing item is read back only from the incompleteness reason', () => {
  assert.equal(incompleteExamItemOf(`exam_items_incomplete:1/4:item=${'2'.repeat(12)}:deepseek_api:rejected:yes_no_answer`), '2'.repeat(12))
  assert.equal(incompleteExamItemOf(`exam_items_incomplete:1/4:item=${'2'.repeat(12)}`), '2'.repeat(12))
  assert.equal(incompleteExamItemOf('exam_items_incomplete:1/4'), null)
  assert.equal(incompleteExamItemOf('revived:exhausted_by_transient_failure:after_3_attempts'), null)
  assert.equal(incompleteExamItemOf(null), null)
})

test('the same question missing on consecutive passes exhausts the set; the first miss is free', async () => {
  const db = oneSet()
  const set = () => db.tables.cos_university_holdout_exam_sets[0]
  const fetchImpl = teacher('STUCKESSAY', YES_NO)

  await pass(db, fetchImpl)
  assert.equal(set().status, 'requested')
  assert.equal(set().attempts, 0, 'a first miss is not charged')
  assert.match(set().last_error, new RegExp(`^exam_items_incomplete:1/2:item=${'2'.repeat(12)}:[a-z0-9_-]+:rejected:yes_no_answer$`))

  for (let charged = 1; charged <= HOLDOUT_EXAM_MAX_SET_ATTEMPTS; charged += 1) {
    await pass(db, fetchImpl)
    assert.equal(set().status, 'failed')
    assert.equal(set().attempts, charged, `repeat ${charged} is charged`)
  }
  // Exhausted: the writer no longer selects it, and the evaluator's existing exhausted-set rule skips it.
  const before = JSON.stringify(set())
  await pass(db, fetchImpl)
  assert.equal(JSON.stringify(set()), before)
  // The good item was written once and kept; nothing was graded.
  assert.equal(db.tables.cos_university_holdout_exam_items.length, 1)
})

test('a different missing item is a fresh miss, not a repeat', async () => {
  const db = oneSet()
  const set = () => db.tables.cos_university_holdout_exam_sets[0]
  set().last_error = `exam_items_incomplete:1/2:item=${'9'.repeat(12)}:deepseek_api:rejected:too_short`
  await pass(db, teacher('STUCKESSAY', YES_NO))
  assert.equal(set().status, 'requested')
  assert.equal(set().attempts, 0)
})

test('a teacher error is recorded as the reason for the missing item', async () => {
  const db = oneSet()
  await pass(db, teacher('STUCKESSAY', 'http500'))
  assert.match(db.tables.cos_university_holdout_exam_sets[0].last_error, new RegExp(`^exam_items_incomplete:1/2:item=${'2'.repeat(12)}:[a-z0-9_-]+:error:`))
})

test('a set whose items are all written still becomes ready', async () => {
  const db = oneSet()
  await pass(db, teacher('NOMATCH', YES_NO))
  const set = db.tables.cos_university_holdout_exam_sets[0]
  assert.equal(set.status, 'ready')
  assert.equal(set.last_error, null)
})
// end of saas/tests/holdoutExamRepeatMiss.node.test.ts (if this line is missing, the paste was cut short)
