// saas/app/api/hub/cyber/remediation-queue/route.ts
// Read-only queue for approved Cybersecurity remediation plans that are ready
// for the next code-preparation layer. This endpoint does not create branches,
// open pull requests, change provider settings, or mark work complete.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  try {
    const admin = getAdminSupabase()
    const { data, error } = await admin.from('remediation_requests')
      .select('id,repo,target,title,summary,severity_summary,findings,fix_plan,fix_plan_status,implementation_status,pull_request_url,created_at,updated_at')
      .eq('source_area', 'cybersecurity')
      .eq('source_type', 'dependency_scan')
      .eq('status', 'approved')
      .eq('fix_plan_status', 'approved_for_pr')
      .eq('implementation_status', 'awaiting_github_pr_preparation')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      queue: data || [],
      count: Array.isArray(data) ? data.length : 0,
      nextStep: 'Prepare a code change for human review. Do not apply or merge automatically.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load remediation queue.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
