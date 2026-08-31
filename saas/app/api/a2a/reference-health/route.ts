import { NextResponse } from 'next/server'
import { probeA2AAvailability } from '@/a2a-host/a2a-availability'
import { fetchA2AAgentCard } from '@/a2a-host/a2a-http-jsonrpc-transport'
import { REFERENCE_A2A_AGENT_VERSION, resolveReferenceA2AOrigin } from '@/a2a-host/reference-a2a-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SKILL_ID = 'self-healing.diagnose'

export async function GET() {
  try {
    const origin = resolveReferenceA2AOrigin()
    const cardUrl = new URL('/api/a2a/reference/self-healing-diagnostic/.well-known/agent-card.json', origin).toString()
    const evidence = await probeA2AAvailability({
      expectedSkillId: SKILL_ID,
      fetchAgentCard: () => fetchA2AAgentCard({ url: cardUrl, timeoutMs: 5_000, maxResponseBytes: 64_000 }),
    })
    return NextResponse.json({
      ok: evidence.available,
      acceptance: 'signalboost-reference-live',
      agentVersion: REFERENCE_A2A_AGENT_VERSION,
      protocolVersion: evidence.protocolVersion ?? null,
      skillId: SKILL_ID,
      latencyMs: evidence.latencyMs,
      ...(evidence.error ? { error: evidence.error } : {}),
      buyerAccepted: false,
    }, { status: evidence.available ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      acceptance: 'signalboost-reference-live',
      agentVersion: REFERENCE_A2A_AGENT_VERSION,
      protocolVersion: null,
      skillId: SKILL_ID,
      latencyMs: 0,
      error: error instanceof Error ? error.message.slice(0, 160) : 'a2a_reference_health_failed',
      buyerAccepted: false,
    }, { status: 503 })
  }
}
