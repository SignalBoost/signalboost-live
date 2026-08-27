import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { portableProductManifests } from '@/lib/portable-products/manifests/index.ts'
import { createMarketingSalesCapabilityDiscovery } from '@/provider-hub-host/marketing-sales-capability-discovery.ts'
import {
  createSupabaseMarketingSalesCapabilityGrantPort,
  listMarketingSalesCapabilityGrants,
  setMarketingSalesCapabilityGrant,
} from '@/provider-hub-host/marketing-sales-capability-grants.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ENVIRONMENT_ID = 'signalboost-cloud'
const PORTABLE_IDS = new Set(portableProductManifests.map(manifest => manifest.productId))
PORTABLE_IDS.add('marketing-sales')

function requestedPortableId(value: unknown): string | null {
  const portableId = String(value ?? '').trim()
  return portableId && PORTABLE_IDS.has(portableId) ? portableId : null
}

async function contextFor(ctx: any) {
  const tenantId = String(ctx.user.id)
  const grants = createSupabaseMarketingSalesCapabilityGrantPort({
    admin: ctx.admin,
    userId: ctx.user.id,
    tenantId,
    environmentId: ENVIRONMENT_ID,
  })
  const discovery = createMarketingSalesCapabilityDiscovery({
    admin: ctx.admin,
    userId: ctx.user.id,
    tenantId,
    environmentId: ENVIRONMENT_ID,
    grants,
  })
  return { tenantId, grants, discovery }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const portableId = requestedPortableId(req.nextUrl.searchParams.get('portableId') || 'marketing-sales')
  if (!portableId) return NextResponse.json({ error: 'Unknown portableId.' }, { status: 400 })

  const { tenantId, discovery } = await contextFor(ctx)
  const catalog = await discovery.discover({
    tenantId,
    environmentId: ENVIRONMENT_ID,
    portableId: 'marketing-sales',
  })
  const visible = portableId === 'marketing-sales' ? catalog : await discovery.discover({
    tenantId,
    environmentId: ENVIRONMENT_ID,
    portableId,
  })
  const grants = await listMarketingSalesCapabilityGrants({
    admin: ctx.admin,
    userId: ctx.user.id,
    tenantId,
    environmentId: ENVIRONMENT_ID,
    portableId,
  })

  const visibleIds = new Set(visible.map(capability => capability.capabilityId))
  return NextResponse.json({
    ok: true,
    bridge: 'marketing-sales-provider-hub-bridge-v1',
    portableId,
    executionDelegated: false,
    note: 'Discovery and authorization reuse existing Marketing + Sales adapters. Publishing and ad-spend execution remain on their existing governed paths.',
    capabilities: catalog.map(capability => ({
      ...capability,
      grantedToPortable: visibleIds.has(capability.capabilityId),
    })),
    grants,
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const action = String(body?.action || '').trim()
  const portableId = requestedPortableId(body?.portableId)
  const capabilityId = String(body?.capabilityId || '').trim()

  if (action !== 'grant' && action !== 'revoke') {
    return NextResponse.json({ error: "action must be 'grant' or 'revoke'." }, { status: 400 })
  }
  if (!portableId || portableId === 'marketing-sales') {
    return NextResponse.json({ error: 'Choose a known consuming portable other than Marketing + Sales itself.' }, { status: 400 })
  }
  if (!capabilityId) return NextResponse.json({ error: 'capabilityId is required.' }, { status: 400 })

  const { tenantId, discovery } = await contextFor(ctx)
  // Authoritative catalog comes from the source portable itself, which is implicitly allowed to
  // discover everything it already owns. Arbitrary caller-supplied capability names are refused.
  const catalog = await discovery.discover({ tenantId, environmentId: ENVIRONMENT_ID, portableId: 'marketing-sales' })
  const descriptor = catalog.find(capability => capability.capabilityId === capabilityId)
  if (!descriptor) return NextResponse.json({ error: 'Capability is not backed by an existing Marketing + Sales adapter.' }, { status: 404 })

  await setMarketingSalesCapabilityGrant({
    admin: ctx.admin,
    userId: ctx.user.id,
    tenantId,
    environmentId: ENVIRONMENT_ID,
    portableId,
    capabilityId,
    enabled: action === 'grant',
    grantedBy: ctx.user.id,
  })

  return NextResponse.json({
    ok: true,
    portableId,
    capabilityId,
    enabled: action === 'grant',
    risk: descriptor.risk,
    requiresApproval: descriptor.requiresApproval,
    executionDelegated: false,
  })
}
