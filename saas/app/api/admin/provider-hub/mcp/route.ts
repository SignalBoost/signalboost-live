import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { createUniversalMcpGateway } from '@/provider-hub-host/universal-mcp-gateway'
import type { UniversalMcpProfileId } from '@/provider-hub-host/universal-mcp-profiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PROVIDERS = new Set<UniversalMcpProfileId>(['github-mcp', 'supabase-mcp', 'context7-mcp'])

function providerId(value: unknown): UniversalMcpProfileId | null {
  const id = String(value ?? '').trim() as UniversalMcpProfileId
  return PROVIDERS.has(id) ? id : null
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || 'mcp_gateway_error')
  return raw.match(/^[a-z0-9_.:-]{1,180}/i)?.[0] ?? 'mcp_gateway_error'
}

async function ownerGateway(userId: string) {
  return createUniversalMcpGateway({
    tenantId: userId,
    environmentId: 'signalboost-cloud',
    portableId: 'owner-mcp-console',
    actor: { userId, roles: ['owner'] },
  })
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok || !guard.ctx.userId) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const gateway = await ownerGateway(guard.ctx.userId)
  const providers = await Promise.all(gateway.readiness.map(async item => {
    if (!item.configured) return { ...item, capabilities: [], connection: item.reason }
    try {
      const capabilities = await gateway.discover(item.providerId)
      return {
        ...item,
        connection: 'connected',
        capabilities: capabilities.map(capability => ({
          capabilityId: capability.capabilityId,
          risk: capability.risk,
          requiresApproval: capability.requiresApproval,
          scopes: capability.scopes,
        })),
      }
    } catch (error) {
      return { ...item, capabilities: [], connection: safeError(error) }
    }
  }))
  return NextResponse.json({
    ok: true,
    schemaVersion: gateway.schemaVersion,
    providers,
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok || !guard.ctx.userId) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => null)
  if (!plain(body)) return NextResponse.json({ error: 'invalid_json_body' }, { status: 400 })
  const serverId = providerId(body.serverId)
  const capabilityId = String(body.capabilityId ?? '').trim()
  const args = plain(body.args) ? body.args : {}
  if (!serverId || !capabilityId) return NextResponse.json({ error: 'invalid_mcp_invocation' }, { status: 400 })

  const gateway = await ownerGateway(guard.ctx.userId)
  const approval = body.approve === true ? {
    approvalId: `owner-mcp:${randomUUID()}`,
    approvedBy: guard.ctx.userId,
    approvedAt: new Date().toISOString(),
  } : undefined
  const result = await gateway.invoke({
    serverId,
    capabilityId,
    args,
    approval,
    traceId: `owner-mcp:${randomUUID()}`,
  })
  const status = result.ok ? 200
    : result.mode === 'approval_required' ? 409
      : result.mode === 'mcp_provider_not_configured' ? 503
        : 400
  return NextResponse.json(result, { status })
}
