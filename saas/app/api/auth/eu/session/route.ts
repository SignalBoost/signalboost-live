import { NextRequest, NextResponse } from 'next/server'
import { authenticateEuBearer } from '@/lib/security/euAuthenticatedClient.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const auth = await authenticateEuBearer(request.headers.get('authorization'))
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  const { data: tenant, error } = await auth.client.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id', auth.user.id).maybeSingle()
  if (error || !tenant) return NextResponse.json({ error: 'eu_tenant_not_provisioned' }, { status: 403, headers })
  return NextResponse.json({ authenticated: true, region: 'eu-central-1', tenantProvisioned: true, userId: auth.user.id }, { headers })
}
