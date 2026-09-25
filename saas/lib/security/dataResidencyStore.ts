// saas/lib/security/dataResidencyStore.ts
// SignalBoost host adapter for the host-neutral residency policy.
// Missing tenant policy is an error for callers that choose the strict helper; there is no
// silent inference from IP address, locale, company address, or prior conversation.

import { getAdminSupabase } from '@/utils/supabase/server'
import {
  buildDataResidencyRoutingConstraint,
  createTenantDataResidencyPolicy,
  type DataClassification,
  type DataResidencyRoutingConstraint,
  type TenantDataResidencyPolicy,
} from './dataResidency.ts'

const TABLE = 'tenant_data_residency_policies'

function tenant(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error('data_residency_tenant_id_required')
  return normalized
}

export async function readTenantDataResidencyPolicy(tenantId: string): Promise<TenantDataResidencyPolicy | null> {
  const id = tenant(tenantId)
  const db = getAdminSupabase()
  const { data, error } = await db
    .from(TABLE)
    .select('tenant_id,residency_profile,allowed_processing_zones,allowed_storage_zones,default_classification,cross_border_transfer_basis,policy_version')
    .eq('tenant_id', id)
    .maybeSingle()

  if (error) throw new Error(`data_residency_policy_read_failed:${error.message}`)
  if (!data) return null

  return createTenantDataResidencyPolicy({
    tenantId: data.tenant_id,
    profile: data.residency_profile,
    allowedProcessingZones: Array.isArray(data.allowed_processing_zones) ? data.allowed_processing_zones : [],
    allowedStorageZones: Array.isArray(data.allowed_storage_zones) ? data.allowed_storage_zones : [],
    defaultClassification: data.default_classification,
    crossBorderTransferBasis: data.cross_border_transfer_basis,
    policyVersion: data.policy_version,
  })
}

export async function requireTenantDataResidencyPolicy(tenantId: string): Promise<TenantDataResidencyPolicy> {
  const policy = await readTenantDataResidencyPolicy(tenantId)
  if (!policy) throw new Error('data_residency_policy_missing')
  return policy
}

export async function dataResidencyConstraintForTenant(
  tenantId: string,
  input?: { classification?: DataClassification | string; containsPersonalData?: boolean },
): Promise<DataResidencyRoutingConstraint> {
  const policy = await requireTenantDataResidencyPolicy(tenantId)
  return buildDataResidencyRoutingConstraint(policy, input)
}
