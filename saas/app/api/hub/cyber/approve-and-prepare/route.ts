// saas/app/api/hub/cyber/approve-and-prepare/route.ts
// One-step endpoint for the UI: approve a reviewed cyber fix plan, then ask the
// existing preparation route to create an owner-reviewable proposal when safe.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

function userIdFromGuard(guard: any): string | null {
  return guard?.ctx?.userId ?? guard?.ctx?.user?.id ?? guard?.ctx?.id ?? null
}

async function runPreparation(req: Request, remediationId: string) {
  const origin = new URL(req.url).origin
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const cookie = req.headers.get('cookie')
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${origin}/api/hub/cyber/prepare-github-pr`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ remediationId }),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok && !!json?.ok, status: res.status, result: json }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = userIdFromGuard(guard)

  let body: { remediationId?: string; approvalNotes?: string } = {}
  try { body = await req.json() } catch { /* defaults */ }
  const remediationId = String(body.remediationId || '').trim()
  if (!remediationId) return NextResponse.json({ ok: false, error: 'remediationId is required.' }, { status: 400 })

  const admin = getAdminSupabase()
  const now = new Date().toISOString()
  const { error } = await admin.from('remediation_requests').update({
    status: 'approved',
    human_approved: true,
    approved_by: userId,
    approved_at: now,
    approval_notes: String(body.approvalNotes || '').trim() || null,
    fix_plan_status: 'approved_for_pr',
    fix_plan_approved: true,
    fix_plan_approved_at: now,
    implementation_status: 'awaiting_github_pr_preparation',
    updated_at: now,
  }).eq('id', remediationId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const preparation = await runPreparation(req, remediationId)
  return NextResponse.json({ ok: true, remediationId, preparation })
}
