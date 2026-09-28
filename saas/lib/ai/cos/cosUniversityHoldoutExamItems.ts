// saas/lib/ai/cos/cosUniversityHoldoutExamItems.ts
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

export const HOLDOUT_EXAM_ITEM_PROFILE = 'cos_university_holdout_exam_item_v1' as const
export const HOLDOUT_EXAM_ITEMS_TABLE = 'cos_university_holdout_exam_items' as const
export const HOLDOUT_EXAM_SETS_TABLE = 'cos_university_holdout_exam_sets' as const
export const HOLDOUT_EXAM_ITEMS_MISSING_ERROR = 'mass_distilled_evaluation_holdout_exam_items_missing' as const
export const HOLDOUT_EXAM_MAX_SET_ATTEMPTS = 3
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
      'The answer must be objectively checkable: a number with units, a named concept, a direction of change, or a specific decision with its reason.',
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
const SELF_REFERENCE = /\b(the (text|passage|material|example|essay) (above|provided|given)|as (described|shown) above|in the (text|passage|material|essay))\b/i

/** Parse and validate the writer's reply. Returns null for anything that would make a weak or ungradable item. */
export function parseHoldoutExamItem(raw: unknown): HoldoutExamItem | null {
  const text = String(raw ?? '').replace(/\*\*/g, '').trim()
  const match = QUESTION_LINE.exec(text)
  if (!match) return null
  const question = clean(match[1], 1200)
  const answerKey = clean(match[2], 800)
  if (question.length < 20 || answerKey.length < 1) return null
  if (!/\?\s*$/.test(question) && !/\b(state|name|calculate|compute|determine|identify|which|what|how|why)\b/i.test(question)) return null
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
  const result = await db.from(HOLDOUT_EXAM_ITEMS_TABLE).select('item_hash,question,answer_key').in('item_hash', hashes)
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
}>

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
  const limit = Math.max(1, Math.min(10, Math.floor(Number(input.limit) || 3)))
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
  if (!sets.length) return Object.freeze({ processed: 0, ready, failed, itemsWritten, itemsReused, errors: Object.freeze([]) })

  const teachers = massEligibleTeachers(env)
  const token = clean(env.HF_TOKEN, 4096)

  for (const set of sets) {
    const candidateId = clean(set.candidate_id, 240)
    const artifactHash = clean(set.trained_artifact_hash, 64).toLowerCase()
    const attempts = Number(set.attempts) || 0
    const fail = async (reason: string) => {
      failed += 1
      errors.push(`${candidateId}:${reason}`.slice(0, 300))
      const updated = await db.from(HOLDOUT_EXAM_SETS_TABLE).update({
        status: 'failed', attempts: attempts + 1, last_error: reason.slice(0, 500), updated_at: now.toISOString(),
      }).eq('candidate_id', candidateId).eq('trained_artifact_hash', artifactHash)
      if (updated.error) throw updated.error
    }
    try {
      if (!teachers.length) { await fail('no_active_mass_teacher'); continue }
      if (token.length < 20) { await fail('hf_token_missing'); continue }
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
            }, { onConflict: 'item_hash', ignoreDuplicates: true })
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
  return Object.freeze({ processed: sets.length, ready, failed, itemsWritten, itemsReused, errors: Object.freeze(errors.slice(0, 20)) })
}
