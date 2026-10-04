// saas/app/api/admin/cos-university-effectiveness/route.ts
//
// The Artifact Effectiveness Funnel, read live from the deployment's own tables. Owner only, read only.
// GET ?window=24h|7d|30d|all&subject=<subject_id>
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { describeFunnel, readEffectivenessFunnel } from '@/lib/ai/cos/cosUniversityEffectivenessFunnel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  }
  try {
    const funnel = await readEffectivenessFunnel({
      db: getAdminSupabase(),
      window: req.nextUrl.searchParams.get('window'),
      subjectId: req.nextUrl.searchParams.get('subject'),
    })
    return NextResponse.json({ ok: true, summary: describeFunnel(funnel), funnel }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/admin/cos-university-effectiveness/route.ts (if this line is missing, the paste was cut short)
