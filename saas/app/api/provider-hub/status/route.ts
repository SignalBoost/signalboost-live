import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getUserProviderConfig } from '@/lib/engine/userProviderConfigs'
import { createProviderHubStatusSurface } from '@/provider-hub-host/status-surface'

export async function GET() {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const record = await getUserProviderConfig(access.userId)
  return NextResponse.json(createProviderHubStatusSurface({
    mode: 'self_service',
    tenantId: access.userId,
    environmentId: 'signalboost-cloud',
    connectionId: `user:${access.userId}`,
    record,
  }))
}
