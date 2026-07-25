import { NextResponse } from 'next/server'

import {
  ProtocolRegistry,
  createA2aAdapter,
  createMavlinkAdapter,
  createMcpAdapter,
  createMqttAdapter,
  createOpcUaAdapter,
  createRos2Adapter,
} from '@/agent-gateway'
import { requireAdmin } from '@/lib/outreach/security'
import { createProtocolCapabilityDiagnostics } from '@/lib/supervisor/operator-diagnostics/protocol-capabilities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function shippedProtocolRegistry(): ProtocolRegistry {
  const registry = new ProtocolRegistry()
  registry.register(createMcpAdapter())
  registry.register(createA2aAdapter())
  registry.register(createMavlinkAdapter())
  registry.register(createRos2Adapter())
  registry.register(createOpcUaAdapter())
  registry.register(createMqttAdapter())
  return registry
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const snapshot = createProtocolCapabilityDiagnostics(
      new Date().toISOString(),
      shippedProtocolRegistry().capabilityCatalog(),
    )
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Protocol capability diagnostics unavailable' },
      { status: 503 },
    )
  }
}
