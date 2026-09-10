import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosUniversitySubjectId } from './cosUniversity.ts'

export const COS_UNIVERSITY_INTEGRITY_VIOLATION_PROFILE = 'cos_university_integrity_violation_v1'

export async function recordCosUniversityIntegrityViolation(input: {
  agentId: string
  subjectId: CosUniversitySubjectId
  evidenceRefs: readonly string[]
  hostVerified: boolean
  observedAt?: Date
  validUntil?: Date
}): Promise<{ stored: boolean; inserted: boolean; eligible: boolean }> {
  const agentId = String(input.agentId || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(agentId)) throw new Error('agent_id_invalid')
  const refs = [...new Set(input.evidenceRefs.map(String).map(value => value.trim()).filter(Boolean))]
  const observedAt = input.observedAt || new Date()
  const validUntil = input.validUntil || new Date(observedAt.getTime() + 90 * 86_400_000)
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(validUntil.getTime()) || validUntil <= observedAt) {
    throw new Error('integrity_violation_validity_invalid')
  }
  const eligible = input.hostVerified === true && refs.length > 0
  const evidence = {
    profile: COS_UNIVERSITY_INTEGRITY_VIOLATION_PROFILE,
    semantics: 'host_verified_integrity_violation_requires_remediation',
    agentId,
    subjectId: input.subjectId,
    evidenceRefs: refs,
    eligible,
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  const eventKey = createHash('sha256').update(`${COS_UNIVERSITY_INTEGRITY_VIOLATION_PROFILE}|${evidenceHash}`).digest('hex')
  const db = cosServiceDb()
  if (!db) return { stored: false, inserted: false, eligible }
  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'integrity_violation',
    subject_id: input.subjectId,
    candidate_id: agentId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_controller',
    observed_at: observedAt.toISOString(),
    expires_at: validUntil.toISOString(),
  })
  if (inserted.error) {
    if (String((inserted.error as { code?: unknown }).code || '') === '23505') return { stored: true, inserted: false, eligible }
    throw inserted.error
  }
  return { stored: true, inserted: true, eligible }
}
