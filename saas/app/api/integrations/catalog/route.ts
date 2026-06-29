// saas/app/api/integrations/catalog/route.ts
// Lists the full sales+marketing provider catalog grouped by category, with each
// provider's connection state for the org and which capabilities are actually wired.
// Owner-gated read. This is what a "Integrations" console renders.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { listProviders, supportsCapability } from '@/lib/integrations/registry'
import { listConnectedProviderIds } from '@/lib/integrations/connections'
import '@/lib/integrations/catalog' // side-effect: registers the catalog

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const orgId = 'signalboost' // owner org; a multi-tenant host resolves this per actor
  const connected = new Set(await listConnectedProviderIds(ctx.admin, orgId))

  const providers = listProviders().map((p) => ({
    id: p.id,
    label: p.label,
    category: p.category,
    auth: p.auth,
    docsUrl: p.docsUrl || null,
    capabilities: p.capabilities,
    implemented: p.capabilities.filter((c) => supportsCapability(p, c)),
    connected: connected.has(p.id),
  }))

  const byCategory: Record<string, any[]> = {}
  for (const p of providers) { (byCategory[p.category] = byCategory[p.category] || []).push(p) }

  return NextResponse.json({ ok: true, total: providers.length, byCategory })
}
