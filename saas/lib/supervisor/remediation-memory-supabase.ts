import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemediationExperience, RemediationMemoryRecord, RemediationMemoryStore } from './remediation-memory.ts'

type Row = { incident_key: string; remedy_id: string; verified_successes: number; verified_failures: number; consecutive_failures: number; recommendation_eligible: boolean; updated_at: string }
function map(row: Row): RemediationMemoryRecord { return Object.freeze({ incidentKey: row.incident_key, remedyId: row.remedy_id, verifiedSuccesses: Number(row.verified_successes), verifiedFailures: Number(row.verified_failures), consecutiveFailures: Number(row.consecutive_failures), recommendationEligible: Boolean(row.recommendation_eligible), updatedAt: Date.parse(row.updated_at) }) }

/** Service-role-only durable adapter. Browser clients must never receive this store. */
export class SupabaseRemediationMemoryStore implements RemediationMemoryStore {
  constructor(private readonly db: SupabaseClient) {}
  async get(incidentKey: string, remedyId: string): Promise<RemediationMemoryRecord | undefined> {
    const result = await this.db.from('cos_remediation_memory').select('incident_key,remedy_id,verified_successes,verified_failures,consecutive_failures,recommendation_eligible,updated_at').eq('incident_key', incidentKey).eq('remedy_id', remedyId).maybeSingle()
    if (result.error) throw result.error
    return result.data ? map(result.data as Row) : undefined
  }
  async set(record: RemediationMemoryRecord): Promise<void> {
    const result = await this.db.from('cos_remediation_memory').upsert({ incident_key: record.incidentKey, remedy_id: record.remedyId, verified_successes: record.verifiedSuccesses, verified_failures: record.verifiedFailures, consecutive_failures: record.consecutiveFailures, recommendation_eligible: record.recommendationEligible, updated_at: new Date(record.updatedAt).toISOString() }, { onConflict: 'incident_key,remedy_id' })
    if (result.error) throw result.error
  }
  async recordExperience(experience: RemediationExperience): Promise<RemediationMemoryRecord> {
    const result = await this.db.rpc('cos_record_remediation_memory', {
      p_incident_key: experience.incidentKey,
      p_remedy_id: experience.remedyId,
      p_succeeded: experience.succeeded,
    }).single()
    if (result.error) throw result.error
    return map(result.data as Row)
  }
}
