import { NextRequest, NextResponse } from 'next/server'
import { resolveEuTenant } from '@/lib/security/resolveEuTenant.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/**
 * Explicit deletion preflight. Records in this response are limited to the caller's
 * Frankfurt tenant. A deletion request is NOT evidence that data was deleted.
 */
export async function GET(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  const scoped = [
    ['eu_projects', 'projects'],
    ['eu_builder_workspaces', 'workspaces'],
    ['eu_builder_workspace_files', 'workspaceFiles'],
  ] as const
  try {
    const counts = await Promise.all(scoped.map(async ([table, key]) => {
      const { count, error } = await owner.client.from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', owner.userId).eq('tenant_id', owner.tenantId)
      if (error || count === null) throw new Error('eu_count_unavailable')
      return [key, count] as const
    }))
    const { data: pending, error } = await owner.client.from('eu_data_rights_requests')
      .select('id,request_type,status,created_at')
      .eq('user_id', owner.userId).eq('tenant_id', owner.tenantId)
      .eq('request_type', 'delete').in('status', ['requested','processing'])
      .order('created_at', { ascending: false }).limit(1)
    if (error) throw new Error('eu_request_unavailable')
    return NextResponse.json({
      region: 'eu-central-1',
      tenantBound: true,
      regionalRecords: Object.fromEntries(counts),
      pendingDeletionRequest: pending?.[0] ?? null,
      deletionExecuted: false,
      automaticPurgeAvailable: false,
      scope: 'frankfurt_account_projects_and_workspace_records_only',
      notice: 'Deletion completion requires independently verified Auth, storage, provider, backup and retention processing; this preflight deletes nothing.',
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'eu_deletion_preflight_unavailable' }, { status: 503, headers })
  }
}
