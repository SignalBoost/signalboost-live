import { NextResponse } from 'next/server'
import { createInMemoryA2AAgentRegistry } from '@/a2a-host/a2a-agent-registry'
import { createA2AHttpJsonRpcTransportFactory, fetchA2AAgentCard } from '@/a2a-host/a2a-http-jsonrpc-transport'
import { runA2ALiveAcceptance } from '@/a2a-host/a2a-live-acceptance'
import { referenceDiagnosticEndpoint } from '@/a2a-host/reference-a2a-config'
import { REFERENCE_DIAGNOSTIC_AGENT_ID, REFERENCE_DIAGNOSTIC_SKILL_ID } from '@/a2a-host/reference-self-healing-diagnostic'
import { requireOwner } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  let endpoint: string
  try { endpoint = referenceDiagnosticEndpoint() } catch {
    return NextResponse.json({ ok: false, error: 'a2a_reference_origin_unconfigured' }, { status: 503 })
  }
  const tenantId = 'signalboost-reference'
  const environmentId = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
  const portableId = 'signalboost-reference-acceptance'
  const transportRef = 'signalboost-reference-self-healing-diagnostic-http'

  const registry = createInMemoryA2AAgentRegistry({
    agents: [{
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      displayName: 'SignalBoost Reference Self-Healing Diagnostic Specialist',
      description: 'Read-only reference specialist for live A2A runtime proof.',
      transportRef,
      enabled: true,
      advertisedSkillIds: [REFERENCE_DIAGNOSTIC_SKILL_ID],
      metadata: { ownership: 'signalboost-reference', acceptanceClass: 'signalboost-reference-live' },
    }],
    assignments: [{
      assignmentId: 'signalboost-reference-diagnostic-assignment',
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId: REFERENCE_DIAGNOSTIC_SKILL_ID, risk: 'advisory' }],
    }],
  })

  const transportFactory = createA2AHttpJsonRpcTransportFactory({
    connectionResolver: { resolve: () => ({ endpoint }) },
  })

  try {
    const record = await runA2ALiveAcceptance({
      registry,
      transportFactory,
      fetchAgentCard: async () => {
        const card = await fetchA2AAgentCard({ url: endpoint }) as Record<string, unknown>
        if (card.url !== endpoint) throw new Error('a2a_reference_agent_card_endpoint_mismatch')
        return card
      },
      tenantId,
      environmentId,
      portableId,
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      familyId: 'self-healing-diagnostic',
      skillId: REFERENCE_DIAGNOSTIC_SKILL_ID,
      messageText: 'Production API requests return 504 gateway timeout after an upstream dependency latency increase. Diagnose the likely failure class and next checks.',
      messageId: `reference-acceptance-${Date.now()}`,
      traceId: `reference-live-${Date.now()}`,
      timeoutMs: 10_000,
    })
    return NextResponse.json({ ok: true, acceptanceClass: 'signalboost-reference-live', buyerAccepted: false, record }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      acceptanceClass: 'signalboost-reference-live',
      buyerAccepted: false,
      error: error instanceof Error ? error.message : 'reference acceptance failed',
    }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
