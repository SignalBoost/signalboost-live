import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getUserProviderConfig } from '@/lib/engine/userProviderConfigs'
import { createProviderHubStatusSurface } from '@/provider-hub-host/status-surface'
import { UNIVERSAL_MCP_CERTIFICATION_STATUS } from '@/provider-hub-host/universal-mcp-certification-status'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok || !guard.ctx.userId) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const record = await getUserProviderConfig(guard.ctx.userId)
  const surface = createProviderHubStatusSurface({
    mode: 'enterprise_admin',
    tenantId: guard.ctx.userId,
    environmentId: 'signalboost-cloud',
    connectionId: `owner:${guard.ctx.userId}`,
    record,
  })
  return NextResponse.json({
    ...surface,
    universalMcp: UNIVERSAL_MCP_CERTIFICATION_STATUS,
  })
}
