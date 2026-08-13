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

function promptHash(prompt: string): string {
  return createHash('sha256').update(clean(prompt, 20_000)).digest('hex')
}

/**
 * External answers are captured as teacher examples only. They are deliberately NOT written into
 * the factual knowledge graph or continuous-learning corpus: another model is not a primary source.
 * A later evaluator can compare the local draft with the teacher answer and promote only reusable,
 * evidence-backed lessons.
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
  } catch (error) {
    console.warn('[cos-teacher-learning] failed to persist teacher example', error)
  }
}
