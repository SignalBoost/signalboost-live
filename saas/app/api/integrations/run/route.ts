// saas/app/api/integrations/run/route.ts
// Executes one provider task (capability) from the console hub. Resolves the org's
// connection, dispatches through the registry, and returns the honest result — real
// when wired + connected, or a clear mode (not_connected / not_implemented / …) when not.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { runCapability } from '@/lib/integrations/registry'
import { resolveConnection } from '@/lib/integrations/connections'
import '@/lib/integrations/catalog' // side-effect: registers all providers
import type { Capability } from '@/lib/integrations/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const providerId = String(body?.providerId || '').trim()
  const capability = String(body?.capability || '').trim() as Capability
  const args = body?.args && typeof body.args === 'object' ? body.args : {}
  if (!providerId || !capability) return NextResponse.json({ ok: false, error: 'providerId and capability are required' }, { status: 400 })

  const orgId = 'signalboost' // owner org; multi-tenant host resolves per actor
  const connection = (await resolveConnection(ctx.admin, orgId, providerId)) || { orgId }
  const result = await runCapability(providerId, capability, connection, args)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
