import { createHash } from 'node:crypto'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'
import {
  selectUniversityTeacher,
  universityTeacherPoolStatus,
  universityTeacherProvenance,
  type UniversityTeacherTransport,
} from './cosUniversityTeacherPool.ts'
import {
  generateWithUniversityTeacher,
  type TeacherGenerationResult,
} from './cosUniversityTeacherAdapters.ts'

const HOSTED_TRANSPORTS: readonly UniversityTeacherTransport[] = Object.freeze([
  'openai_responses',
  'openai_compatible',
  'anthropic_messages',
  'custom_adapter',
])
const DEFAULT_MAX_OUTPUT_TOKENS = 1200
const DEFAULT_PARALLELISM = 3
const HARD_MAX_CALLS_PER_CYCLE = 48
const HARD_MAX_OUTPUT_TOKENS = 2048
const HARD_MAX_PARALLELISM = 6

type Env = Record<string, string | undefined>

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function promptFor(subject: string, ordinal: number): { system: string; prompt: string } {
  return {
    system: [
      'You are one teacher in the COS University multi-provider distillation faculty.',
      'Produce only a self-contained expert teaching example, not hidden reasoning.',
      'Do not quote copyrighted source passages, claim private context, invent citations, or claim current-web access.',
      'The output will become governed synthetic curriculum for training a buyer-controlled student model.',
    ].join(' '),
    prompt: [
      `Subject: ${subject}`,
      `Variant: ${ordinal + 1}`,
      'Create a distinct expert lesson that teaches one important concept, diagnostic pattern, counterexample, or applied decision in this subject.',
      'Include a concrete problem or scenario, the correct resolution, and a brief explanation of why the resolution is correct.',
      'Make this variant materially different from nearby variants. Return only the lesson text.',
    ].join('\n'),
  }
}

function sourceUri(provider: string, requestId: string | null, contentHash: string): string {
  const request = String(requestId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120)
  return `itmounts://cos-university/hosted-teacher/${encodeURIComponent(provider)}/${request || contentHash.slice(0, 24)}`
}

async function persistTeacherResult(input: {
  db: any
  now: Date
  subject: string
  ordinal: number
  routingKey: string
  result: TeacherGenerationResult
  teacher: NonNullable<ReturnType<typeof selectUniversityTeacher>>
}) {
  const provenance = universityTeacherProvenance({
    teacher: input.teacher,
    routingKey: input.routingKey,
  })
  const contentHash = sha256([
    'cos-university-hosted-teacher-v1',
    input.subject,
    input.teacher.id,
    input.result.provider,
    input.result.model,
    input.result.text,
  ].join(':'))
  const row = {
    content_hash: contentHash,
    source_kind: 'teacher_hosted_curriculum',
    source_uri: sourceUri(input.result.provider, input.result.requestId, contentHash),
    source_title: `${input.subject} — ${input.teacher.id} teacher synthesis ${input.ordinal + 1}`,
    observed_at: input.now.toISOString(),
    subject: input.subject,
    summary: input.result.text,
    facts: [
      {
        origin: 'hosted_teacher',
        profile: 'cos-university-multi-provider-distillation-v1',
        teacherId: input.teacher.id,
        provider: input.result.provider,
        model: input.result.model,
        ordinal: input.ordinal,
      },
      { constraint: 'synthetic_teacher_output_no_private_context_no_hidden_exam' },
    ],
    confidence: 1,
    license: 'synthetic-benchmark-fixture',
    evidence: [{
      profile: 'cos-university-multi-provider-distillation-v1',
      origin: 'hosted_teacher',
      provenance,
      requestId: input.result.requestId,
      inputTokens: input.result.inputTokens,
      outputTokens: input.result.outputTokens,
      responseHash: sha256(input.result.text),
      authorityExpanded: false,
      silentFallbackAllowed: false,
    }],
  }
  const write = await input.db.from('cos_continuous_learning')
    .upsert(row, { onConflict: 'content_hash', ignoreDuplicates: true })
  if (write.error) throw write.error
  return {
    subject: input.subject,
    teacherId: input.teacher.id,
    provider: input.result.provider,
    model: input.result.model,
    requestId: input.result.requestId,
    inputTokens: input.result.inputTokens,
    outputTokens: input.result.outputTokens,
    contentHash,
  }
}

/**
 * Generate rights-classified synthetic curriculum directly from explicitly enabled hosted teachers.
 *
 * Cost-bearing hosted calls are disabled unless COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE
 * is explicitly set above zero. Provider enable + adapter-ready + buyer credential gates are also
 * required by universityTeacherPoolStatus(). No provider fallback occurs on failure.
 */
export async function installHostedTeacherCurriculum(input: {
  db: any
  supply: readonly MassDistillationSubjectSupply[]
  now: Date
  maxSubjects: number
  env?: Env
  fetchImpl?: typeof fetch
}) {
  const env = input.env || process.env
  const maxCalls = boundedInt(
    env.COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE,
    0,
    0,
    HARD_MAX_CALLS_PER_CYCLE,
  )
  const maxOutputTokens = boundedInt(
    env.COS_UNIVERSITY_TEACHER_HOSTED_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    128,
    HARD_MAX_OUTPUT_TOKENS,
  )
  const parallelism = boundedInt(
    env.COS_UNIVERSITY_TEACHER_HOSTED_PARALLELISM,
    DEFAULT_PARALLELISM,
    1,
    HARD_MAX_PARALLELISM,
  )
  const status = universityTeacherPoolStatus(env)
  const hosted = status.activeProviders.filter(provider => HOSTED_TRANSPORTS.includes(provider.transport))

  if (maxCalls === 0) {
    return Object.freeze({
      ok: true,
      skipped: true,
      reason: 'hosted_teacher_call_budget_not_authorized',
      activeProviders: hosted.map(item => item.id),
      attempted: 0,
      inserted: 0,
      failures: [],
    })
  }
  if (!hosted.length) {
    return Object.freeze({
      ok: true,
      skipped: true,
      reason: 'no_active_hosted_teacher_provider',
      activeProviders: [],
      attempted: 0,
      inserted: 0,
      failures: [],
    })
  }

  const targets = [...input.supply]
    .filter(subject => subject.shortfallToBatch > 0)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || a.subject.localeCompare(b.subject))
    .slice(0, input.maxSubjects)

  const tasks: Array<{ subject: string; ordinal: number; routingKey: string; teacherId: string }> = []
  let remaining = maxCalls
  let providerCursor = 0
  for (const target of targets) {
    const count = Math.min(Math.max(0, target.shortfallToBatch), remaining)
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const teacher = hosted[providerCursor % hosted.length]
      providerCursor += 1
      tasks.push({
        subject: target.subject,
        ordinal,
        routingKey: `hosted-distillation:${target.subject}:${ordinal}:${teacher.id}`,
        teacherId: teacher.id,
      })
    }
    remaining -= count
    if (remaining <= 0) break
  }

  const successes: any[] = []
  const failures: Array<{ subject: string; teacherId: string | null; error: string }> = []
  for (let offset = 0; offset < tasks.length; offset += parallelism) {
    const chunk = tasks.slice(offset, offset + parallelism)
    const settled = await Promise.allSettled(chunk.map(async task => {
      // The pool status has already enforced enabled + credential + adapter readiness. Round-robin
      // across that exact active set so every enabled hosted provider contributes when the bounded
      // call budget permits, instead of merely making provider diversity statistically likely.
      const teacher = status.activeProviders.find(item => item.id === task.teacherId)
        ?? selectUniversityTeacher({ routingKey: task.routingKey, allowedTransports: HOSTED_TRANSPORTS, env })
      if (!teacher || !HOSTED_TRANSPORTS.includes(teacher.transport)) throw new Error('hosted_teacher_selection_unavailable')
      const request = promptFor(task.subject, task.ordinal)
      const result = await generateWithUniversityTeacher({
        teacher,
        env,
        fetchImpl: input.fetchImpl,
        request: {
          ...request,
          maxOutputTokens,
          temperature: 0.2,
        },
      })
      return persistTeacherResult({
        db: input.db,
        now: input.now,
        subject: task.subject,
        ordinal: task.ordinal,
        routingKey: task.routingKey,
        result,
        teacher,
      })
    }))
    settled.forEach((entry, index) => {
      if (entry.status === 'fulfilled') successes.push(entry.value)
      else {
        const task = chunk[index]
        failures.push({
          subject: task.subject,
          teacherId: task.teacherId || null,
          error: String(entry.reason instanceof Error ? entry.reason.message : entry.reason || 'unknown_error').slice(0, 300),
        })
      }
    })
  }

  return Object.freeze({
    ok: failures.length === 0,
    skipped: false,
    activeProviders: hosted.map(item => item.id),
    providerScheduling: 'deterministic_round_robin',
    attempted: tasks.length,
    inserted: successes.length,
    successes: Object.freeze(successes),
    failures: Object.freeze(failures),
    maxCalls,
    maxOutputTokens,
    parallelism,
    authorityExpanded: false,
    silentFallbackAllowed: false,
  })
}
