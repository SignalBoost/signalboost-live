// saas/tests/cosUniversityHoldoutExamItems.node.test.ts
//
// 2026-09-27: 279 of 529 Holdout failures were both-zero. A holdout row is a withheld teaching essay whose prompt is
// the teacher's generation instruction, so both models wrote their own example and neither could match the
// teacher's specific essay. Holdout is now asked as one real exam question + short answer key per withheld essay.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HOLDOUT_EXAM_ITEMS_MISSING_ERROR,
  HOLDOUT_EXAM_ITEM_PROFILE,
  fillRequestedHoldoutExamSets,
  holdoutExamReadyArtifacts,
  holdoutExamWriterRequest,
  parseHoldoutExamItem,
} from '../lib/ai/cos/cosUniversityHoldoutExamItems.ts'

const H = (c: string) => c.repeat(64)

test('a well-formed question and checkable key parse', () => {
  const item = parseHoldoutExamItem('QUESTION: A line has cutting at 40 units/hr, assembly at 25 units/hr and packing at 60 units/hr. What is the system capacity and which stage is the bottleneck?\nANSWER KEY: 25 units/hr; assembly is the bottleneck.')
  assert.ok(item)
  assert.match(item!.question, /25 units\/hr|bottleneck/)
  assert.equal(item!.answerKey, '25 units/hr; assembly is the bottleneck.')
})

test('yes/no, self-referencing, and malformed items are rejected', () => {
  assert.equal(parseHoldoutExamItem('QUESTION: Is adding capacity to a non-bottleneck stage useful for throughput?\nANSWER KEY: No.'), null)
  assert.equal(parseHoldoutExamItem('QUESTION: Based on the example above, what is the reorder point?\nANSWER KEY: 140 units.'), null)
  assert.equal(parseHoldoutExamItem('Here is a teaching example about bottlenecks.'), null)
  assert.equal(parseHoldoutExamItem('QUESTION: Why?\nANSWER KEY: Because.'), null)
})

test('the writer is told to produce a self-contained, checkable, non-yes/no question from the withheld essay', () => {
  const request = holdoutExamWriterRequest({ subjectId: 'Business & Operations', referenceEssay: 'Concept: throughput bottleneck analysis. Capacity equals the slowest stage.' })
  assert.match(request.system, /fully self-contained/)
  assert.match(request.system, /Never write a yes\/no question/)
  assert.match(request.system, /QUESTION: <the question>/)
  assert.match(request.prompt, /Business & Operations/)
  assert.match(request.prompt, /slowest stage/)
})

// Minimal in-memory stand-in for the two tables and the batch-run table.
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

test('the evaluation gate returns only ready artifacts and requests the rest exactly once', async () => {
  const db = fakeDb({ sets: [{ candidate_id: 'mass:a', trained_artifact_hash: H('a'), status: 'ready' }] })
  const artifacts = [
    { candidateId: 'mass:a', artifactHash: H('a') },
    { candidateId: 'mass:b', artifactHash: H('b') },
  ]
  const ready = await holdoutExamReadyArtifacts(db, artifacts)
  assert.deepEqual(ready.map(item => item.candidateId), ['mass:a'])
  assert.equal(db.tables.cos_university_holdout_exam_sets.find(r => r.candidate_id === 'mass:b')?.status, 'requested')
  await holdoutExamReadyArtifacts(db, artifacts)
  assert.equal(db.tables.cos_university_holdout_exam_sets.filter(r => r.candidate_id === 'mass:b').length, 1)
})

test('a requested set becomes ready only when every withheld essay has a valid exam item', async () => {
  const run = {
    candidate_id: 'mass:q', subject_id: 'Business & Operations', trained_artifact_hash: H('c'),
    holdout_data_ref: `hf://datasets/cadomos/itmounts-training-x@${'a'.repeat(40)}#holdout`, holdout_manifest_hash: H('d'),
  }
  const db = fakeDb({
    sets: [{ candidate_id: 'mass:q', trained_artifact_hash: H('c'), status: 'requested', attempts: 0 }],
    items: [{ item_hash: H('1'), profile: HOLDOUT_EXAM_ITEM_PROFILE, question: 'Reused question that already exists for this item?', answer_key: 'Reused key.' }],
    runs: [run],
  })
  const rows = [
    { text: 'essay one', item_hash: H('1'), prompt: 'Standalone rights-cleared learning case…', response: 'Essay one about bottlenecks.' },
    { text: 'essay two', item_hash: H('2'), prompt: 'Standalone rights-cleared learning case…', response: 'Essay two about reorder points.' },
  ]
  const env = {
    HF_TOKEN: 'x'.repeat(30),
    COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED: 'true',
    COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ADAPTER_READY: 'true',
    COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL: 'deepseek-chat',
    DEEPSEEK_API_KEY: 'k'.repeat(30),
  }
  const fetchImpl = (async () => new Response(JSON.stringify({
    id: 'req-1', model: 'teacher-model',
    choices: [{ message: { content: 'QUESTION: A team sets its reorder point from average demand alone and ignores how much demand varies week to week. What failure does this invite, and which element is missing?\nANSWER KEY: Stockouts whenever demand runs above average; safety stock is the missing element.' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
  const result = await fillRequestedHoldoutExamSets({ db, env, fetchImpl, readRows: (async () => rows) as any })
  const set = db.tables.cos_university_holdout_exam_sets[0]
  assert.equal(result.ready, 1, JSON.stringify(result))
  assert.equal(set.status, 'ready')
  assert.deepEqual(set.item_hashes, [H('1'), H('2')])
  assert.equal(result.itemsReused, 1)
  assert.equal(result.itemsWritten, 1)
  const written = db.tables.cos_university_holdout_exam_items.find(r => r.item_hash === H('2'))
  assert.match(written.answer_key, /safety stock is the missing element/)
  assert.match(written.question, /reorder point/)
  assert.equal(written.profile, HOLDOUT_EXAM_ITEM_PROFILE, 'written items carry the current generation')
})

test('a set with no usable teacher fails visibly and is retried a bounded number of times', async () => {
  const db = fakeDb({ sets: [{ candidate_id: 'mass:z', trained_artifact_hash: H('e'), status: 'requested', attempts: 0 }] })
  const result = await fillRequestedHoldoutExamSets({ db, env: { HF_TOKEN: 'x'.repeat(30) }, readRows: (async () => []) as any })
  assert.equal(result.failed, 1)
  const set = db.tables.cos_university_holdout_exam_sets[0]
  assert.equal(set.status, 'failed')
  assert.equal(set.attempts, 1)
  assert.equal(set.last_error, 'no_active_mass_teacher')
})

test('the evaluator asks the exam question, grades against the key, and stops before inference if items are missing', () => {
  const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(evaluator, /readReadyHoldoutExamItems\(db, validated\.map\(row => row\.itemHash\)\)/)
  assert.match(evaluator, /prompt: item\.question, reference: item\.answerKey, evaluationMode: 'deterministic'/)
  assert.match(evaluator, /throw new Error\(`\$\{HOLDOUT_EXAM_ITEMS_MISSING_ERROR\}:/)
  assert.equal(HOLDOUT_EXAM_ITEMS_MISSING_ERROR, 'mass_distilled_evaluation_holdout_exam_items_missing')
})

test('the evaluation route only approves exam-ready artifacts, and a missing-items stop is infrastructure', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  // Production 2026-09-28: questions requested for every pending artifact at once left 33 random artifacts ready and
  // none eligible; the lane examined nobody for two hours. The approval policy now picks first, and questions are
  // prepared only for its next few picks.
  assert.match(route, /const HOLDOUT_EXAM_LOOKAHEAD = 6/)
  assert.match(route, /artifacts: remaining,/)
  assert.match(route, /const examReady = await holdoutExamReadyArtifacts\(db, picks\.map\(pick => pick\.artifact\), now\)/)
  assert.doesNotMatch(route, /holdoutExamReadyArtifacts\(db, undisposed, now\)/)
  assert.ok(route.indexOf('decideRollingMassEvaluationApproval({', route.indexOf('HOLDOUT_EXAM_LOOKAHEAD; index'))
    < route.indexOf('await holdoutExamReadyArtifacts(db, picks'), 'the policy picks before questions are requested')
  const rolling = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
  assert.match(rolling, /error\.startsWith\('mass_distilled_evaluation_holdout_exam_items_missing'\)/)
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.ok(vercel.crons.some((c: any) => c.path === '/api/cron/cos-university-holdout-exam-items'))
})


test('artifacts the route asks about again jump the question-writing queue, newest first', async () => {
  const old = '2026-09-28T02:57:00.000Z'
  const db = fakeDb({ sets: [
    { candidate_id: 'mass:old', trained_artifact_hash: H('e'), status: 'requested', updated_at: old },
    { candidate_id: 'mass:next', trained_artifact_hash: H('f'), status: 'requested', updated_at: old },
  ] })
  const now = new Date('2026-09-28T05:00:00.000Z')
  const ready = await holdoutExamReadyArtifacts(db, [{ candidateId: 'mass:next', artifactHash: H('f') }], now)
  assert.equal(ready.length, 0)
  const sets = db.tables.cos_university_holdout_exam_sets
  assert.equal(sets.find(r => r.candidate_id === 'mass:next')?.updated_at, now.toISOString())
  assert.equal(sets.find(r => r.candidate_id === 'mass:old')?.updated_at, old)
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityHoldoutExamItems.ts', import.meta.url), 'utf8')
  assert.match(source, /\.order\('updated_at', \{ ascending: false \}\)/)
})
