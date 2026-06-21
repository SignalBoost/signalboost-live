// saas/app/api/hub/audit/provider-inventory/route.ts
// Provider Inventory — owner-gated JSON. Collects a full snapshot and returns
// the deterministic provider inventory (status + risk + finding counts).

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildProviderInventory } from '@/lib/audit/providerInventory'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const snapshot = await collectSnapshot()
    const report = buildProviderInventory(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build provider inventory.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
