import { NextResponse } from 'next/server'
import { failurePatterns, governanceEvents, governanceSubsystems, governanceSummary, rebuildPlans, safeModeStatus } from '@/lib/admin/governance'
import { getMarketingAdmin } from '@/lib/auth/marketingAdmin'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

type GovernanceAccessUser = {
  permissions?: unknown
  roles?: unknown
  role?: unknown
  app_metadata?: {
    permissions?: unknown
    roles?: unknown
    role?: unknown
  }
}

function hasGovernanceReadAccess(user: unknown) {
  const accessUser = user as GovernanceAccessUser
  const permissions = [accessUser.permissions, accessUser.app_metadata?.permissions]
  const roles = [accessUser.roles, accessUser.role, accessUser.app_metadata?.roles, accessUser.app_metadata?.role]

  return permissions.some((value) => Array.isArray(value) && value.includes('governance:read')) ||
    roles.some((value) => Array.isArray(value) ? value.includes('platform-admin') : value === 'platform-admin')
}

export async function GET() {
  const { user, isAdmin } = await getMarketingAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (!isAdmin || !hasGovernanceReadAccess(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

  return NextResponse.json({ summary: governanceSummary, safeMode: safeModeStatus, subsystems: governanceSubsystems, events: governanceEvents, patterns: failurePatterns, rebuildPlans }, { headers: NO_STORE })
}
