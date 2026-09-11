import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosUniversityAgentRole } from './cosUniversityRoleCurriculum.ts'

export const COS_UNIVERSITY_AGENT_ROLES: readonly CosUniversityAgentRole[] = Object.freeze([
  'chief_of_staff_generalist', 'software_engineering', 'cybersecurity',
  'quantitative_data_science', 'enterprise_operations_governance',
  'scientific_physical_systems', 'aerospace_nuclear_safety',
  'molecular_biomedical_sciences', 'neuroscience_biophysics',
  'actuarial_insurance_risk', 'quantum_theoretical_physics',
])

export function isCosUniversityAgentRole(value: unknown): value is CosUniversityAgentRole {
  return COS_UNIVERSITY_AGENT_ROLES.includes(value as CosUniversityAgentRole)
}

export type CosUniversityRegisteredAgent = Readonly<{ agentId: string; role: CosUniversityAgentRole }>

export async function listCosUniversityRegisteredAgents(limit?: number): Promise<CosUniversityRegisteredAgent[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const requested = limit == null ? Number.POSITIVE_INFINITY : Math.max(1, limit)
  const pageSize = Math.min(500, requested)
  const rows: Array<{ agent_id: string; role: unknown }> = []
  for (let from = 0; rows.length < requested; from += pageSize) {
    const result = await db.from('cos_university_agent_registry')
      .select('agent_id,role').order('agent_id', { ascending: true }).range(from, from + pageSize - 1)
    if (result.error) throw result.error
    const page = (result.data || []) as Array<{ agent_id: string; role: unknown }>
    rows.push(...page.slice(0, requested - rows.length))
    if (page.length < pageSize) break
  }
  return rows.map((row) => {
    if (!isCosUniversityAgentRole(row.role)) throw new Error('invalid_persisted_agent_role')
    return Object.freeze({ agentId: row.agent_id, role: row.role })
  })
}

export async function readCosUniversityAgentRole(agentId: string): Promise<CosUniversityAgentRole | null> {
  const id = String(agentId || '').trim()
  if (!id) throw new Error('agent_id_required')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_agent_registry')
    .select('role').eq('agent_id', id).maybeSingle()
  if (result.error) throw result.error
  const role = (result.data as { role?: unknown } | null)?.role
  if (role == null) return null
  if (!isCosUniversityAgentRole(role)) throw new Error('invalid_persisted_agent_role')
  return role
}

/** Host-only identity binding. A role chooses education; it never grants runtime authority. */
export async function persistCosUniversityAgentRole(input: {
  agentId: string
  role: CosUniversityAgentRole
  assignedBy: string
}): Promise<void> {
  const agentId = String(input.agentId || '').trim()
  const assignedBy = String(input.assignedBy || '').trim()
  if (!agentId) throw new Error('agent_id_required')
  if (!assignedBy) throw new Error('assigned_by_required')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_agent_registry').upsert({
    agent_id: agentId, role: input.role, assigned_by: assignedBy,
  }, { onConflict: 'agent_id' })
  if (result.error) throw result.error
}
