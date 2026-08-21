// saas/app/api/admin/cos-evidence-source-use/route.ts
//
// Owner-only, read-only: which learned-corpus source kinds are earning their prompt budget.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import {
  HIGH_VALUE_RATE,
  LOW_UTILIZATION_RATE,
  MINIMUM_INJECTIONS_FOR_VERDICT,
} from '@/lib/ai/cos/evidenceSourceUse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const requested = Number(request.nextUrl.searchParams.get('limit'))
  const result = await readEvidenceSourceUse(Number.isFinite(requested) && requested > 0 ? requested : undefined)
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })

  return NextResponse.json({
    ok: true,
    report: result.report,
    thresholds: {
      minimumInjectionsForVerdict: MINIMUM_INJECTIONS_FOR_VERDICT,
      lowUtilizationBelow: LOW_UTILIZATION_RATE,
      highValueAtOrAbove: HIGH_VALUE_RATE,
    },
    note: 'This is learned-corpus source-kind utilization, not automatic source trust. A zero cited rate means injected evidence did not materially affect answers under the current citation contract. Outcome fields are correlations joined by turn_id, not proof of causality. Do not auto-drop sources from this report alone.',
  })
}
