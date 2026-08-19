//
// WHAT HAS COS ACTUALLY LEARNED ABOUT WHAT WORKS — owner-only, read-only, derived on request.
//
// This exists BEFORE anything applies the profile, deliberately. A learned behavior change that
// nobody could inspect first would be the worst possible version of this feature: output quietly
// shifting for reasons no one can name. Read this, disagree with it if the evidence is thin, and
// only then wire it into generation.
//
// Sits with the other three learning checks, each answering a different question:
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
    // What a generator would actually apply today. Empty means measured outcomes do not yet justify
    // changing anything — which is a real answer, not a missing one.
    overrides: appliedStrategyOverrides(result.profile),
    note: 'Derived on read from measured campaigns only; no stored weights. A dimension appears in overrides only when it has enough campaigns per option AND a large enough gap between options. Nothing applies these yet — this endpoint is for reviewing the evidence before generation consumes it.',
  })
}
