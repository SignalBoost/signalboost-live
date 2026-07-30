// saas/app/api/hub/infra-pr/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { listInfrastructurePRs } from '@/lib/hub/pr-engine'
import { redactPrsForDisplay } from '@/lib/hub/pr-redact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The engine can only filter by ONE status per call and applies the row
// limit server-side AFTER that filter — so filtering "open OR merging" only
// on the client (after a single unfiltered, limited fetch) can silently drop
// a genuinely open PR once 50+ newer merged/closed/failed rows exist. Query
// each actionable status separately (each gets its own limit budget), then
// merge and sort — this guarantees every open/merging PR is represented
// regardless of how much closed history exists.
export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const [open, merging] = await Promise.all([
    listInfrastructurePRs('open', 100),
    listInfrastructurePRs('merging', 50),
  ])

  if (!open.ok) return NextResponse.json(open, { status: 500 })
  if (!merging.ok) return NextResponse.json(merging, { status: 500 })

  const combined = [...open.prs, ...merging.prs].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return NextResponse.json({ ok: true, prs: redactPrsForDisplay(combined) })
}
