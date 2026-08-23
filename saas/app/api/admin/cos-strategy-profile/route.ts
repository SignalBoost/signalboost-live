//
// WHAT HAS COS ACTUALLY LEARNED ABOUT WHAT WORKS — owner-only, read-only, derived on request.
//
// The profile remains directly inspectable even though learned overrides are now available to COS
// generation. Generation and this endpoint share the same strategy derivation rules: measured
// outcomes only, minimum sample sizes, and a minimum relative margin before behavior changes.
//
// Sits with the other learning checks, each answering a different question:
//   /api/admin/cos-learning/continuity  — is the learning cycle still running
//   /api/admin/cos-learning/coverage    — did the declared subjects arrive
//   /api/admin/cos-holdout-certification — can COS use what it learned
// This one: did measured outcomes teach COS anything it should DO differently.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readStrategyProfile } from '@/lib/ai/cos/strategyProfileReport'
import { appliedStrategyOverrides } from '@/lib/ai/cos/strategyProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const params = new URL(req.url).searchParams
  const result = await readStrategyProfile({
    privileged: true,
    organizationId: params.get('organizationId') ?? undefined,
    workspace: params.get('workspace') ?? undefined,
  })

  if ('error' in result) {
    return NextResponse.json({ ok: false, error: result.error, scopeStatus: result.scopeStatus }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    organizationId: result.organizationId,
    profile: result.profile,
    // This is exactly what COS generation is allowed to apply. Empty means measured outcomes do not
    // justify changing the normal generation defaults — a real strategy result, not missing data.
    overrides: appliedStrategyOverrides(result.profile),
    note: 'Derived on read from measured campaigns only; no mutable strategy-weight table. COS generation applies only learned overrides. Dimensions with insufficient evidence or no clear winner keep the normal generation defaults, and the profile reasons remain available for explanation/provenance.',
  })
}
