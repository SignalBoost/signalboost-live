import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'

export type TeacherEscalation = {
  prompt: string
  localAnswer?: string | null
  localConfidence?: number | null
  escalationReason?: string | null
  teacherAnswer: string
  teacherProvider?: string | null
  teacherModel?: string | null
  metadata?: Record<string, unknown>
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function promptHash(prompt: string): string {
  return sha256(clean(prompt, 20_000))
}

async function recordTeacherExperience(args: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  hash: string
  subject: string
  input: TeacherEscalation
}): Promise<void> {
  const experienceHash = sha256(`teacher:${args.hash}`)
  const existing = await args.db
    .from('cos_cognitive_experiences')
    .select('id,occurrence_count')
    .eq('experience_hash', experienceHash)
    .maybeSingle()

  const now = new Date().toISOString()
  const evidence = {
    teacherProvider: args.input.teacherProvider ? clean(args.input.teacherProvider, 120) : null,
    teacherModel: args.input.teacherModel ? clean(args.input.teacherModel, 200) : null,
    localConfidence: Number.isFinite(Number(args.input.localConfidence)) ? Number(args.input.localConfidence) : null,
    escalationReason: args.input.escalationReason ? clean(args.input.escalationReason, 1000) : null,
    metadata: args.input.metadata ?? {},
    lessonSemantics: 'teacher_signal_not_verified_truth',
  }

  if (existing.data?.id) {
    await args.db
      .from('cos_cognitive_experiences')
      .update({
        occurrence_count: Number(existing.data.occurrence_count || 1) + 1,
        last_observed_at: now,
        evidence,
        updated_at: now,
      })
      .eq('id', existing.data.id)
    return
  }

  await args.db.from('cos_cognitive_experiences').insert({
    experience_hash: experienceHash,
    subject: args.subject,
    experience_kind: 'teacher',
    prompt_hash: args.hash,
    source_kind: 'external_teacher',
    source_ref: `cos_teacher_lessons:${args.hash}`,
    evidence,
    first_observed_at: now,
    last_observed_at: now,
    updated_at: now,
  })
}

/**
 * External answers are captured as teacher examples only. They are deliberately NOT written into
 * the factual knowledge graph or continuous-learning corpus: another model is not a primary source.
 * The same event is also recorded as episodic experience so COS can later reflect on repeated
 * failures/teachers without confusing "I experienced this" with "I learned this".
 */
export async function recordTeacherEscalation(input: TeacherEscalation): Promise<void> {
  const db = cosServiceDb()
  const prompt = clean(input.prompt, 20_000)
  const teacherAnswer = clean(input.teacherAnswer, 40_000)
  if (!db || !prompt || !teacherAnswer) return

  const hash = promptHash(prompt)
  const subject = nearestFoundationalSubject(prompt) || clean(prompt, 240)
  try {
    const existing = await db.from('cos_teacher_lessons').select('id,repeat_count').eq('prompt_hash', hash).maybeSingle()
    const payload = {
      prompt_hash: hash,
      prompt,
      subject,
      local_answer: input.localAnswer ? clean(input.localAnswer, 40_000) : null,
      local_confidence: Number.isFinite(Number(input.localConfidence)) ? Number(input.localConfidence) : null,
      escalation_reason: input.escalationReason ? clean(input.escalationReason, 4000) : null,
      teacher_answer: teacherAnswer,
      teacher_provider: input.teacherProvider ? clean(input.teacherProvider, 120) : null,
      teacher_model: input.teacherModel ? clean(input.teacherModel, 200) : null,
      status: 'captured',
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    }
    if (existing.data?.id) {
      await db.from('cos_teacher_lessons').update({ ...payload, repeat_count: Number(existing.data.repeat_count || 1) + 1 }).eq('id', existing.data.id)
    } else {
      await db.from('cos_teacher_lessons').insert(payload)
    }

    await recordTeacherExperience({ db, hash, subject, input })
  } catch (error) {
    console.warn('[cos-teacher-learning] failed to persist teacher example/experience', error)
  }
}
