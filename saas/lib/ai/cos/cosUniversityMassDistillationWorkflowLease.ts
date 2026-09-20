import { randomUUID } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const UNIVERSITY_MASS_DISTILLATION_WORKFLOW_LEASE_TTL_SECONDS = 330

export type UniversityMassDistillationWorkflowLease = Readonly<{
  acquired: boolean
  ownerToken: string
  expiresAt: string | null
  ttlSeconds: number
}>

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function claimUniversityMassDistillationWorkflowLease(): Promise<UniversityMassDistillationWorkflowLease> {
  const db = cosServiceDb()
  if (!db) throw new Error('mass_distillation_workflow_lease_database_unavailable')
  const ownerToken = randomUUID()
  const { data, error } = await db.rpc('claim_cos_university_mass_distillation_workflow_lease', {
    p_owner: ownerToken,
    p_ttl_seconds: UNIVERSITY_MASS_DISTILLATION_WORKFLOW_LEASE_TTL_SECONDS,
  })
  if (error) throw new Error(`mass_distillation_workflow_lease_claim_failed:${clean(error.message || error.code)}`)
  const row = (data || {}) as Record<string, unknown>
  return Object.freeze({
    acquired: row.acquired === true,
    ownerToken,
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
    ttlSeconds: Math.max(60, Number(row.ttlSeconds || UNIVERSITY_MASS_DISTILLATION_WORKFLOW_LEASE_TTL_SECONDS)),
  })
}

export async function releaseUniversityMassDistillationWorkflowLease(ownerToken: string): Promise<boolean> {
  const db = cosServiceDb()
  if (!db || !ownerToken) return false
  const { data, error } = await db.rpc('release_cos_university_mass_distillation_workflow_lease', {
    p_owner: ownerToken,
  })
  if (error) throw new Error(`mass_distillation_workflow_lease_release_failed:${clean(error.message || error.code)}`)
  return data === true
}
