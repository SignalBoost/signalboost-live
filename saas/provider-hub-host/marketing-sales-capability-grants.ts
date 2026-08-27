import type { MarketingSalesCapabilityGrantPort } from './marketing-sales-capability-discovery.ts'

const TABLE = 'provider_hub_portable_capability_grants'

type AnyClient = { from: (table: string) => any }

export type MarketingSalesCapabilityGrantRecord = {
  portableId: string
  capabilityId: string
  enabled: boolean
  updatedAt: string | null
}

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Provider Hub capability grant ${field} is required`)
  return normalized
}

export function createSupabaseMarketingSalesCapabilityGrantPort(input: {
  admin: AnyClient
  userId: string
  tenantId: string
  environmentId: string
}): MarketingSalesCapabilityGrantPort {
  const userId = required(input.userId, 'userId')
  const tenantId = required(input.tenantId, 'tenantId')
  const environmentId = required(input.environmentId, 'environmentId')

  return Object.freeze({
    async isAllowed(request) {
      if (request.tenantId !== tenantId || request.environmentId !== environmentId) return false
      const { data, error } = await input.admin.from(TABLE)
        .select('enabled')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .eq('environment_id', environmentId)
        .eq('portable_id', required(request.portableId, 'portableId'))
        .eq('capability_id', required(request.capabilityId, 'capabilityId'))
        .eq('enabled', true)
        .maybeSingle()
      if (error) throw error
      return data?.enabled === true
    },
  })
}

export async function listMarketingSalesCapabilityGrants(input: {
  admin: AnyClient
  userId: string
  tenantId: string
  environmentId: string
  portableId?: string
}): Promise<MarketingSalesCapabilityGrantRecord[]> {
  const userId = required(input.userId, 'userId')
  const tenantId = required(input.tenantId, 'tenantId')
  const environmentId = required(input.environmentId, 'environmentId')
  let query = input.admin.from(TABLE)
    .select('portable_id,capability_id,enabled,updated_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('environment_id', environmentId)
    .order('portable_id', { ascending: true })
    .order('capability_id', { ascending: true })
  if (input.portableId) query = query.eq('portable_id', required(input.portableId, 'portableId'))
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row: any) => ({
    portableId: String(row.portable_id),
    capabilityId: String(row.capability_id),
    enabled: row.enabled === true,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }))
}

export async function setMarketingSalesCapabilityGrant(input: {
  admin: AnyClient
  userId: string
  tenantId: string
  environmentId: string
  portableId: string
  capabilityId: string
  enabled: boolean
  grantedBy?: string | null
}): Promise<void> {
  const userId = required(input.userId, 'userId')
  const tenantId = required(input.tenantId, 'tenantId')
  const environmentId = required(input.environmentId, 'environmentId')
  const portableId = required(input.portableId, 'portableId')
  const capabilityId = required(input.capabilityId, 'capabilityId')
  const now = new Date().toISOString()
  const { error } = await input.admin.from(TABLE).upsert({
    user_id: userId,
    tenant_id: tenantId,
    environment_id: environmentId,
    portable_id: portableId,
    capability_id: capabilityId,
    enabled: Boolean(input.enabled),
    granted_by: input.grantedBy || null,
    updated_at: now,
  }, { onConflict: 'user_id,tenant_id,environment_id,portable_id,capability_id' })
  if (error) throw error
}
