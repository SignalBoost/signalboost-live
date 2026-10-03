//
// Real Holdout exam questions (owner decision 2026-09-27, "option 1").
//
// A mass-distillation holdout row is a withheld TEACHING ESSAY. Its `prompt` column is the instruction that was
// given to the teacher ("Standalone rights-cleared learning case ... Task: turn the supplied material into one
// rigorous standalone teaching example ..."), and its `response` is the one essay the teacher wrote. The evaluator
// sent that instruction to both models and graded each freshly written example against the teacher's specific
// essay in deterministic mode. A different, equally valid example cannot match another example's numbers, so the
// judge scored both models 0 on every case: 279 of 529 Holdout failures (Production, 2026-09-27) were both-zero,
// i.e. never really graded.
//
// This module turns every withheld essay into ONE real exam question with a short, checkable answer key, written
// once per holdout item by a governed University teacher (the same faculty that wrote the reference) and stored
// by the item's immutable hash. The evaluator then asks the question and grades against the key. The essay stays
// withheld from training exactly as before; manifests and item hashes are unchanged.
//
// Scope: only artifacts the evaluation lane actually wants (requested by the evaluation route) are prepared, a few
// per tick, so this adds a handful of small teacher calls per examined artifact and nothing for the backlog.

import { createHash } from 'node:crypto'
import { readPinnedHfParquetRows, type PinnedParquetRow } from './hfPinnedParquetRows.ts'
import { universityTeacherPoolStatus, type UniversityTeacherDefinition, type UniversityTeacherTransport } from './cosUniversityTeacherPool.ts'
import { generateWithUniversityTeacher } from './cosUniversityTeacherAdapters.ts'
import {
  EXAM_SET_RECOVERY_MAX_PER_RUN,
  decideExamSetRecovery,
  shouldChargeAttempt,
  type ExamSetPopulation,
  type ExamSetRecoveryCandidate,
} from './cosUniversityHoldoutExamSetRecovery.ts'

// v1 -> v2 (2026-09-28): v1 items were written under an instruction that invited multi-step arithmetic, and
// 1,543 distinct v1 questions scored 0 for both the trained student and its own base. v2 items are written and
// validated for single-step answerability. The reader below accepts ONLY the current profile, so a v1 row is
// treated as absent and the writer replaces it on the next pass; nothing is deleted.
export const HOLDOUT_EXAM_ITEM_PROFILE = 'cos_university_holdout_exam_item_v2' as const
export const HOLDOUT_EXAM_ITEMS_TABLE = 'cos_university_holdout_exam_items' as const
export const HOLDOUT_EXAM_SETS_TABLE = 'cos_university_holdout_exam_sets' as const
export const HOLDOUT_EXAM_ITEMS_MISSING_ERROR = 'mass_distilled_evaluation_holdout_exam_items_missing' as const
export const HOLDOUT_EXAM_MAX_SET_ATTEMPTS = 3
/** Runaway bound only. The real batch size is the deployment's declared capacity, passed in by the caller. */
export const EXAM_SET_FILL_MAX_PER_RUN = 500
export const HOLDOUT_EXAM_WRITER_MAX_OUTPUT_TOKENS = 320

const HEX64 = /^[a-f0-9]{64}$/
const HEX40 = /^[a-f0-9]{40}$/
const HF_DATASET_REF = /^hf:\/\/datasets\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([a-f0-9]{40})#([A-Za-z0-9_.-]+)$/i
const HOSTED_TRANSPORTS: readonly UniversityTeacherTransport[] = Object.freeze([
  'openai_responses',
  'openai_compatible',
  'anthropic_messages',
  'gemini_generate_content',
])

type Env = Record<string, string | undefined>

export type HoldoutExamItem = Readonly<{ question: string; answerKey: string }>

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** The writer instruction. Deterministic, so every item is written under the same contract. */
export function holdoutExamWriterRequest(input: { subjectId: string; referenceEssay: string }) {
  return Object.freeze({
    system: [
      'You write university exam items from withheld teaching material.',
      'Write exactly ONE exam question and ONE short answer key that test the central concept of the material.',
      'The question must be fully self-contained: include every number, condition, and scenario detail a student needs, and never refer to "the text", "the example", "above", or "the material".',
      'The answer must be objectively checkable: a named concept or effect, a direction of change, the specific error to avoid, the evidence that would settle the question, or a decision with its reason.',
      'The student answers in one or two sentences with NO working shown, so the question must be answerable in a single step of reasoning.',
      'Do NOT ask for multi-step arithmetic, formula evaluation, or more than one quantity. Never ask the student to calculate, compute or derive several results. One approximate quantity is acceptable only when a knowledgeable person could state it without writing out a calculation.',
      'Prefer the shape "what effect is this, and what settles it" over "work out the number".',
      'Never write a yes/no question and never write an opinion, essay, or "explain in general" question.',
      'The answer key must be 1-2 sentences containing the exact expected result.',
      'Return exactly two lines and nothing else:',
      'QUESTION: <the question>',
      'ANSWER KEY: <the expected answer>',
    ].join(' '),
    prompt: [
      `Subject: ${clean(input.subjectId, 240) || 'general'}.`,
      'Withheld teaching material:',
      clean(input.referenceEssay, 6000),
    ].join('\n\n'),
  })
}

const QUESTION_LINE = /QUESTION\s*:\s*([\s\S]*?)\s*ANSWER\s*KEY\s*:\s*([\s\S]*)$/i
const YES_NO_ONLY = /^(yes|no)\b[.!]?\s*$/i
// Production 2026-09-28: 1,643 of 2,726 graded Holdout cases scored 0 for BOTH the trained student and its own
// untrained base, across 1,543 DISTINCT questions. The questions were not malformed - they were good, and too hard
// for the asking conditions. The student is Qwen3-4B, answers with thinking disabled (/no_think in the evaluator
// system prompt and enable_thinking=False at the gateway), and has a few hundred output tokens. Asked to "state the
// EOQ, safety stock and reorder point" it cannot chain three computations in one forward pass, and neither can its
// base, so the case discriminates nothing and silently caps every student. The qualitative fixed suites prove the
// contrast: Transfer, which asks "name the bias and the data needed to test it", is both-zero on only 15% of cases
// and is the one suite where training helps more often than it hurts.
// Multi-step arithmetic is therefore refused at write time. A SINGLE approximate quantity stays allowed, because
// transfer-base-rate-quantified ("state the approximate probability", answer "about 16%") is one of the cases that
// does discriminate. This changes which questions get written, never how answers are scored.
const COMPUTATION_ASK = /\b(calculat\w*|comput\w*|deriv\w*|work out|solve for|evaluate the (?:formula|expression|integral))\b/i
// An arithmetic expression in the ANSWER means the student had to evaluate it. LaTeX may sit between the equals sign
// and the first digit (\(-100 + 115/1.10 = \$4.55\)), so allow it rather than requiring a digit immediately.
const FORMULA_SHAPE = /\\sqrt|\\frac|\\times\s*10\^|\bsqrt\s*\(|=[^.]{0,40}?\d[\d,.]*\s*[-+*/]\s*\d/i
const NUMERIC_TOKEN = /-?\d[\d,]*(?:\.\d+)?/g
/**
 * Quantities the ANSWER introduces that the QUESTION did not supply. One is a single-step result a knowledgeable
 * person can state ("about 16%"); several mean the student had to chain computations ("EOQ 707, safety stock 22,
 * reorder point 222"). Figures restated from the question are not results, which is why transfer-base-rate-quantified
 * ("95% sensitive ... about 16%") stays acceptable while the EOQ item does not.
 */
function newQuantitiesInAnswer(question: string, answerKey: string): number {
  const given = new Set((question.match(NUMERIC_TOKEN) || []).map(value => value.replace(/,/g, '')))
  const introduced = new Set<string>()
  for (const value of answerKey.match(NUMERIC_TOKEN) || []) {
    const normalized = value.replace(/,/g, '')
    if (!given.has(normalized)) introduced.add(normalized)
  }
  return introduced.size
}
const SELF_REFERENCE = /\b(the (text|passage|material|example|essay) (above|provided|given)|as (described|shown) above|in the (text|passage|material|essay))\b/i

/** Parse and validate the writer's reply. Returns null for anything that would make a weak or ungradable item. */
export function parseHoldoutExamItem(raw: unknown): HoldoutExamItem | null {
  const text = String(raw ?? '').replace(/\*\*/g, '').trim()
  const match = QUESTION_LINE.exec(text)
  if (!match) return null
  const question = clean(match[1], 1200)
  const answerKey = clean(match[2], 800)
  if (question.length < 20 || answerKey.length < 1) return null
  if (!/\?\s*$/.test(question) && !/\b(state|name|determine|identify|which|what|how|why)\b/i.test(question)) return null
  if (COMPUTATION_ASK.test(question)) return null
  if (FORMULA_SHAPE.test(answerKey)) return null
  if (newQuantitiesInAnswer(question, answerKey) > 1) return null
  if (YES_NO_ONLY.test(answerKey)) return null
  if (/^(is|are|does|do|can|should|will|was|were|has|have)\b/i.test(question) && /^(yes|no)\b/i.test(answerKey)) return null
  if (SELF_REFERENCE.test(question)) return null
  return Object.freeze({ question, answerKey })
}

function massEligibleTeachers(env: Env): UniversityTeacherDefinition[] {
  return universityTeacherPoolStatus(env).activeProviders
    .filter(item => HOSTED_TRANSPORTS.includes(item.transport) && item.massDistillationEligible === true)
    .map(item => Object.freeze({
      id: item.id,
      provider: item.provider,
      transport: item.transport,
      model: item.model,
      credentialEnv: item.credentialEnv,
      enabledEnv: item.enabledEnv,
      adapterReadyEnv: item.adapterReadyEnv,
      modelEnv: item.modelEnv,
      endpointEnv: item.endpointEnv,
      defaultEndpoint: item.defaultEndpoint,
      massDistillationEligible: true,
      buyerOwnedCredential: true,
      provenanceRequired: true,
      costCeilingRequired: true,
      silentFallbackAllowed: false,
    }))
}

/** Ready exam items for these holdout item hashes (full 64-char hashes). Missing hashes are simply absent. */
export async function readReadyHoldoutExamItems(db: any, itemHashes: readonly string[]): Promise<Map<string, HoldoutExamItem>> {
  const hashes = [...new Set(itemHashes.map(item => clean(item, 64).toLowerCase()).filter(item => HEX64.test(item)))]
  const out = new Map<string, HoldoutExamItem>()
  if (!hashes.length) return out
  const result = await db.from(HOLDOUT_EXAM_ITEMS_TABLE)
    .select('item_hash,question,answer_key')
    .eq('profile', HOLDOUT_EXAM_ITEM_PROFILE)
    .in('item_hash', hashes)
  if (result.error) throw result.error
  for (const row of result.data || []) {
    const hash = clean(row.item_hash, 64).toLowerCase()
    const question = clean(row.question, 1200)
    const answerKey = clean(row.answer_key, 800)
    if (HEX64.test(hash) && question && answerKey) out.set(hash, Object.freeze({ question, answerKey }))
  }
  return out
}

type ArtifactKey = Readonly<{ candidateId: string; artifactHash: string }>
const keyOf = (item: ArtifactKey) => `${clean(item.candidateId, 240)}:${clean(item.artifactHash, 64).toLowerCase()}`

/**
 * Evaluation-route gate. Returns the artifacts whose holdout exam set is ready and records a `requested` set for
 * the others (idempotent), so the exam-item writer prepares exactly the artifacts evaluation wants next.
 */
export async function holdoutExamReadyArtifacts<T extends ArtifactKey>(db: any, artifacts: readonly T[], now = new Date()): Promise<T[]> {
  if (!artifacts.length) return []
  const candidateIds = [...new Set(artifacts.map(item => clean(item.candidateId, 240)).filter(Boolean))]
  const ready = new Set<string>()
  const known = new Set<string>()
  for (let offset = 0; offset < candidateIds.length; offset += 200) {
    const result = await db.from(HOLDOUT_EXAM_SETS_TABLE)
      .select('candidate_id,trained_artifact_hash,status')
      .in('candidate_id', candidateIds.slice(offset, offset + 200))
    if (result.error) throw result.error
    for (const row of result.data || []) {
      const key = keyOf({ candidateId: row.candidate_id, artifactHash: row.trained_artifact_hash })
      known.add(key)
      if (row.status === 'ready') ready.add(key)
    }
  }
  const requests = artifacts
    .filter(item => !known.has(keyOf(item)) && HEX64.test(clean(item.artifactHash, 64).toLowerCase()))
    .slice(0, 500)
    .map(item => ({
      candidate_id: clean(item.candidateId, 240),
      trained_artifact_hash: clean(item.artifactHash, 64).toLowerCase(),
      status: 'requested',
      attempts: 0,
      item_hashes: [],
      updated_at: now.toISOString(),
    }))
  if (requests.length) {
    const inserted = await db.from(HOLDOUT_EXAM_SETS_TABLE)
      .upsert(requests, { onConflict: 'candidate_id,trained_artifact_hash', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
  }
  // Already-requested sets the evaluation route asks about again are the ones it will examine next: refresh them so
  // the writer (newest first) prepares them before the backlog. Production 2026-09-28: every pending artifact was
  // requested at once, the writer filled 33 effectively at random, none was eligible for approval, and the exam
  // lane examined nobody for over two hours.
  for (const item of artifacts) {
    const key = keyOf(item)
    if (!known.has(key) || ready.has(key) || !HEX64.test(clean(item.artifactHash, 64).toLowerCase())) continue
    const touched = await db.from(HOLDOUT_EXAM_SETS_TABLE)
      .update({ updated_at: now.toISOString() })
      .eq('candidate_id', clean(item.candidateId, 240))
      .eq('trained_artifact_hash', clean(item.artifactHash, 64).toLowerCase())
      .eq('status', 'requested')
    if (touched?.error) throw touched.error
  }
  return artifacts.filter(item => ready.has(keyOf(item)))
}

function holdoutReference(row: PinnedParquetRow): string {
  const response = clean(row.response, 20_000)
  if (response) return response
  const text = String(row.text || '')
  const marker = text.indexOf('\n\n<assistant>\n')
  return clean(marker >= 0 ? text.slice(marker + '\n\n<assistant>\n'.length) : text, 20_000)
}

export type HoldoutExamFillResult = Readonly<{
  processed: number
  ready: number
  failed: number
  itemsWritten: number
  itemsReused: number
  errors: readonly string[]
  /** Set to a global precondition when the run stopped before examining any set. Null on a normal run. */
  aborted: string | null
  /** Exhausted sets given a fresh attempt budget by the governed sweep this run. */
  revived: number
  /** The whole set population, so a stalled exam lane can say WHY instead of looking idle. */
  population: ExamSetPopulation | null
}>

/** How far back a transiently-failed set is pushed so it sorts behind fresh requests instead of starving them. */
export const TRANSIENT_BACKOFF_MS = 20 * 60 * 1000

/**
 * The exam-set population, counted cheaply with head reads.
 *
 * Reported on every run because `no_mass_artifact_with_holdout_exam_ready` is indistinguishable from "nothing to do"
 * without it. Production 2026-10-03: 237 artifacts waiting at `evaluation_ready`, zero admitted in 24 hours, and the
 * lane's own reason gave no hint that every candidate had been permanently disqualified by the attempt ceiling.
 */
export async function readExamSetPopulation(db: any): Promise<ExamSetPopulation | null> {
  try {
    const count = async (build: (query: any) => any): Promise<number> => {
      const result = await build(db.from(HOLDOUT_EXAM_SETS_TABLE).select('candidate_id', { count: 'exact', head: true }))
      if (result?.error) throw result.error
      return typeof result?.count === 'number' && result.count >= 0 ? result.count : 0
    }
    const [requested, failed, ready, exhausted] = await Promise.all([
      count(query => query.eq('status', 'requested')),
      count(query => query.eq('status', 'failed')),
      count(query => query.eq('status', 'ready')),
      count(query => query.gte('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS).neq('status', 'ready')),
    ])
    return Object.freeze({ requested, failed, ready, exhausted })
  } catch {
    // An unreadable population is a reason to look, never a reason to stop writing exams.
    return null
  }
}

/**
 * Give exhausted sets their attempt budget back, bounded and after a cool-off.
 *
 * Only sets whose recorded failure was NOT structural are revived: a set whose pinned holdout is malformed cannot
 * succeed however many times it is retried, so reviving it would spend teacher calls on nothing. Those stay exhausted
 * and are counted in the population instead, which is the honest treatment - visible rather than silently removed.
 */
export async function reviveExhaustedExamSets(input: { db: any; now: Date; maxPerRun?: number }): Promise<number> {
  const db = input.db
  try {
    const stale = await db.from(HOLDOUT_EXAM_SETS_TABLE)
      .select('candidate_id,trained_artifact_hash,attempts,last_error,updated_at')
      .gte('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS)
      .neq('status', 'ready')
      .order('updated_at', { ascending: true })
      .limit(Math.max(1, Math.min(200, (input.maxPerRun ?? EXAM_SET_RECOVERY_MAX_PER_RUN) * 4)))
    if (stale.error) return 0

    const candidates: ExamSetRecoveryCandidate[] = (stale.data || []).map((row: any) => ({
      candidateId: clean(row.candidate_id, 240),
      artifactHash: clean(row.trained_artifact_hash, 64).toLowerCase(),
      attempts: Number(row.attempts) || 0,
      lastError: row.last_error == null ? null : clean(row.last_error, 500),
      updatedAt: row.updated_at == null ? null : String(row.updated_at),
    }))

    const decisions = decideExamSetRecovery({
      sets: candidates,
      now: input.now,
      maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
      maxPerRun: input.maxPerRun,
    })
    let revived = 0
    for (const decision of decisions) {
      const reset = await db.from(HOLDOUT_EXAM_SETS_TABLE).update({
        status: 'requested',
        attempts: 0,
        last_error: `revived:${decision.reason}:after_${decision.previousAttempts}_attempts`,
        updated_at: input.now.toISOString(),
      })
        .eq('candidate_id', decision.candidateId)
        .eq('trained_artifact_hash', decision.artifactHash)
        // Conditional on it still being exhausted, so a concurrent run cannot revive the same set twice.
        .gte('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS)
      if (!reset.error) revived += 1
    }
    return revived
  } catch {
    return 0
  }
}

/**
 * Prepare up to `limit` requested artifacts: read each artifact's pinned holdout, write one exam item per withheld
 * essay that does not already have one, and mark the set ready only when every holdout item has a valid item.
 */
export async function fillRequestedHoldoutExamSets(input: {
  db: any
  env?: Env
  fetchImpl?: typeof fetch
  limit?: number
  now?: Date
  readRows?: typeof readPinnedHfParquetRows
}): Promise<HoldoutExamFillResult> {
  const env = input.env || process.env
  const now = input.now || new Date()
  // Owner 2026-10-03, "build a Ferrari not a Lada": the ceiling was 10 because the whole line rationed a 10-worker
  // RunPod account. Writing exam items spends small teacher calls and NO inference worker, so this station never
  // needed to be narrow. The caller passes the batch its declared capacity allows; this bound only stops a runaway.
  const limit = Math.max(1, Math.min(EXAM_SET_FILL_MAX_PER_RUN, Math.floor(Number(input.limit) || 3)))
  const readRows = input.readRows || readPinnedHfParquetRows
  const db = input.db
  const errors: string[] = []
  let ready = 0
  let failed = 0
  let itemsWritten = 0
  let itemsReused = 0

  const pending = await db.from(HOLDOUT_EXAM_SETS_TABLE)
    .select('candidate_id,trained_artifact_hash,status,attempts')
    .in('status', ['requested', 'failed'])
    .lt('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS)
    // Newest request first: the evaluation route requests (or refreshes) exactly the artifacts it will examine next.
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (pending.error) throw pending.error
  const sets = pending.data || []

  // Global preconditions are properties of the DEPLOYMENT, read once per run and true for every set in the batch.
  // Marking individual sets failed for either one is a category error with permanent consequences: at 10 sets a tick
  // and 6 ticks an hour, a brief outage burns the whole requested population past the attempt ceiling and the exam
  // lane can never admit anyone again. Abort the run instead and let the next tick try.
  const teachers = massEligibleTeachers(env)
  const token = clean(env.HF_TOKEN, 4096)
  const abortReason = !teachers.length
    ? 'no_active_mass_teacher'
    : token.length < 20
      ? 'hf_token_missing'
      : null
  if (abortReason) {
    const population = await readExamSetPopulation(db)
    return Object.freeze({
      processed: 0, ready, failed, itemsWritten, itemsReused,
      errors: Object.freeze([abortReason]), aborted: abortReason, revived: 0, population,
    })
  }

  // Give exhausted sets their budget back when their recorded failure was not structural. Without this, a population
  // burned out by an earlier outage stays invisible to this writer forever and the line never restarts.
  const revived = await reviveExhaustedExamSets({ db, now })

  if (!sets.length) {
    const population = await readExamSetPopulation(db)
    return Object.freeze({
      processed: 0, ready, failed, itemsWritten, itemsReused,
      errors: Object.freeze([]), aborted: null, revived, population,
    })
  }

  for (const set of sets) {
    const candidateId = clean(set.candidate_id, 240)
    const artifactHash = clean(set.trained_artifact_hash, 64).toLowerCase()
    const attempts = Number(set.attempts) || 0
    // Only a STRUCTURAL failure spends this set's attempt budget. A provider error, a timeout, a rate limit or an
    // unparseable reply is our fault and passing, so the set goes back to `requested` with its budget intact and a
    // recorded reason. Its `updated_at` is pushed into the past so it sorts behind fresh requests - a backoff that
    // needs no extra column - and the evaluation route still pulls it forward when it is the artifact it wants next.
    const fail = async (reason: string) => {
      failed += 1
      errors.push(`${candidateId}:${reason}`.slice(0, 300))
      const charged = shouldChargeAttempt(reason)
      const updated = await db.from(HOLDOUT_EXAM_SETS_TABLE).update({
        status: charged ? 'failed' : 'requested',
        attempts: charged ? attempts + 1 : attempts,
        last_error: reason.slice(0, 500),
        updated_at: charged ? now.toISOString() : new Date(now.getTime() - TRANSIENT_BACKOFF_MS).toISOString(),
      }).eq('candidate_id', candidateId).eq('trained_artifact_hash', artifactHash)
      if (updated.error) throw updated.error
    }
    try {
      // Both global preconditions were checked before the loop and abort the whole run, so no set is charged for them.
      const run = await db.from('cos_university_mass_distillation_batch_runs')
        .select('candidate_id,subject_id,holdout_data_ref,holdout_manifest_hash,trained_artifact_hash')
        .eq('candidate_id', candidateId)
        .maybeSingle()
      if (run.error) throw run.error
      if (!run.data || clean(run.data.trained_artifact_hash, 64).toLowerCase() !== artifactHash) { await fail('mass_run_binding_missing'); continue }
      const match = HF_DATASET_REF.exec(clean(run.data.holdout_data_ref, 2000))
      if (!match || !HEX40.test(match[2])) { await fail('holdout_ref_invalid'); continue }
      const rows = await readRows({ repoId: match[1], revision: match[2], split: match[3], token, fetchImpl: input.fetchImpl })
      if (!rows.length || rows.length > 100) { await fail('holdout_count_invalid'); continue }

      const hashes = rows.map(row => clean(row.item_hash, 64).toLowerCase())
      if (hashes.some(hash => !HEX64.test(hash))) { await fail('holdout_item_hash_invalid'); continue }
      const existing = await readReadyHoldoutExamItems(db, hashes)
      const subjectId = clean(run.data.subject_id, 240)
      let missing = 0
      for (let index = 0; index < rows.length; index += 1) {
        const itemHash = hashes[index]
        if (existing.has(itemHash)) { itemsReused += 1; continue }
        const reference = holdoutReference(rows[index])
        if (!reference) { missing += 1; continue }
        const request = holdoutExamWriterRequest({ subjectId, referenceEssay: reference })
        let written = false
        for (const teacher of teachers) {
          try {
            const result = await generateWithUniversityTeacher({
              teacher,
              env,
              fetchImpl: input.fetchImpl,
              request: { system: request.system, prompt: request.prompt, maxOutputTokens: HOLDOUT_EXAM_WRITER_MAX_OUTPUT_TOKENS, temperature: 0.1 },
            })
            const item = parseHoldoutExamItem(result.text)
            if (!item) continue
            const stored = await db.from(HOLDOUT_EXAM_ITEMS_TABLE).upsert({
              item_hash: itemHash,
              profile: HOLDOUT_EXAM_ITEM_PROFILE,
              subject_id: subjectId || null,
              question: item.question,
              answer_key: item.answerKey,
              source_hash: sha256(reference),
              writer_provider: clean(result.provider, 80) || teacher.provider,
              writer_model: clean(result.model, 240) || teacher.model,
            }, { onConflict: 'item_hash', ignoreDuplicates: false })
            if (stored.error) throw stored.error
            itemsWritten += 1
            written = true
            break
          } catch (error) {
            errors.push(`${candidateId}:${teacher.id}:${clean(error instanceof Error ? error.message : error, 160)}`)
          }
        }
        if (!written) missing += 1
      }
      if (missing > 0) { await fail(`exam_items_incomplete:${missing}/${rows.length}`); continue }
      const updated = await db.from(HOLDOUT_EXAM_SETS_TABLE).update({
        status: 'ready',
        holdout_manifest_hash: clean(run.data.holdout_manifest_hash, 64).toLowerCase() || null,
        item_hashes: hashes,
        attempts: attempts + 1,
        last_error: null,
        updated_at: now.toISOString(),
      }).eq('candidate_id', candidateId).eq('trained_artifact_hash', artifactHash)
      if (updated.error) throw updated.error
      ready += 1
    } catch (error) {
      await fail(clean(error instanceof Error ? error.message : error, 300) || 'unknown_error').catch(() => undefined)
    }
  }
  const population = await readExamSetPopulation(db)
  return Object.freeze({
    processed: sets.length, ready, failed, itemsWritten, itemsReused,
    errors: Object.freeze(errors.slice(0, 20)), aborted: null, revived, population,
  })
}
