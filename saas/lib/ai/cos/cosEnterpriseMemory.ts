import { getAdminSupabase } from '@/utils/supabase/server'

export type COSEnterpriseMemoryScope = {
  organizationId: string
  workspace?: string
  source: 'signalboost_internal' | 'explicit_privileged'
}

export type COSEnterpriseMemoryScopeResolution = {
  scope: COSEnterpriseMemoryScope | null
  status: 'connected_scope' | 'not_authorized' | 'organization_not_found' | 'lookup_failed'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanWorkspace(value: unknown): string | undefined {
  const workspace = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80)
  return workspace || undefined
}

function internalDomain(): string {
  return String(process.env.COS_ENTERPRISE_MEMORY_CANONICAL_DOMAIN || 'saas.signalboostapp.com')
    .trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * Resolve the only organization scope COS Primary is currently allowed to read.
 *
 * There is no production tenant-membership table linking ordinary authenticated users to rows in
 * enterprise_organizations. Until that authorization model exists, customer sessions fail closed.
 * Verified owner/admin sessions may read SignalBoost's own organization memory by canonical domain,
 * or an explicitly requested organization id for privileged internal analysis.
 */
export async function resolveCosEnterpriseMemoryScope(args: {
  privileged: boolean
  requestedOrganizationId?: unknown
  workspace?: unknown
}): Promise<COSEnterpriseMemoryScopeResolution> {
  if (!args.privileged) return { scope: null, status: 'not_authorized' }

  try {
    const admin = getAdminSupabase()
    const requested = String(args.requestedOrganizationId ?? '').trim()
    const workspace = cleanWorkspace(args.workspace)

    if (requested) {
      if (!UUID.test(requested)) return { scope: null, status: 'organization_not_found' }
      const result = await admin.from('enterprise_organizations').select('id').eq('id', requested).maybeSingle()
      if (result.error || !result.data?.id) return { scope: null, status: 'organization_not_found' }
      return {
        scope: { organizationId: String(result.data.id), workspace, source: 'explicit_privileged' },
        status: 'connected_scope',
      }
    }

    const result = await admin.from('enterprise_organizations')
      .select('id')
      .eq('canonical_domain', internalDomain())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (result.error || !result.data?.id) return { scope: null, status: 'organization_not_found' }
    return {
      scope: { organizationId: String(result.data.id), workspace, source: 'signalboost_internal' },
      status: 'connected_scope',
    }
  } catch {
    return { scope: null, status: 'lookup_failed' }
  }
}
