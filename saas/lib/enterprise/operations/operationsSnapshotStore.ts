// saas/lib/enterprise/operations/operationsSnapshotStore.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperationsIntelligenceSnapshot } from './operationsIntelligence'

const TABLE = 'enterprise_operations_snapshots'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOperationsIntelligenceSnapshot(value: unknown): OperationsIntelligenceSnapshot {
  if (!isRecord(value)) throw new Error('Operations snapshot must be an object.')
  if (typeof value.organizationId !== 'string' || !value.organizationId.trim()) throw new Error('Operations snapshot requires organizationId.')
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) throw new Error('Operations snapshot requires a valid generatedAt timestamp.')
  if (!isRecord(value.health) || typeof value.health.score !== 'number' || !['green', 'yellow', 'red'].includes(String(value.health.state))) throw new Error('Operations snapshot health is invalid.')
  if (!isRecord(value.incidents) || !isRecord(value.verification) || !isRecord(value.learning) || !isRecord(value.playbooks)) throw new Error('Operations snapshot sections are invalid.')
  if (!Array.isArray(value.recentIncidentIds) || value.recentIncidentIds.some(item => typeof item !== 'string')) throw new Error('Operations snapshot recentIncidentIds is invalid.')
  return value as OperationsIntelligenceSnapshot
}

export class SupabaseOperationsSnapshotStore {
  private readonly client: SupabaseClient
  constructor(client: SupabaseClient) { this.client = client;}

  async save(snapshot: OperationsIntelligenceSnapshot): Promise<OperationsIntelligenceSnapshot> {
    const validated = parseOperationsIntelligenceSnapshot(snapshot)
    const organizationId = validated.organizationId.trim()
    const generatedAt = new Date(validated.generatedAt).toISOString()
    const normalized = Object.freeze({ ...validated, organizationId, generatedAt }) as OperationsIntelligenceSnapshot

    const { error } = await this.client
      .from(TABLE)
      .upsert({
        organization_id: organizationId,
        generated_at: generatedAt,
        snapshot: normalized,
      }, {
        onConflict: 'organization_id,generated_at',
        ignoreDuplicates: false,
      })

    if (error) throw new Error(`Unable to save operations snapshot: ${error.message}`)
    return normalized
  }

  async getLatest(organizationId: string): Promise<OperationsIntelligenceSnapshot | null> {
    const normalized = organizationId.trim()
    if (!normalized) throw new Error('organizationId is required.')

    const { data, error } = await this.client
      .from(TABLE)
      .select('snapshot')
      .eq('organization_id', normalized)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Unable to load operations snapshot: ${error.message}`)
    if (!data) return null
    return parseOperationsIntelligenceSnapshot(data.snapshot)
  }
}
