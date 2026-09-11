// Compatibility endpoint: routine preparation never invents a human approval.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { sameOriginCyberMutation, isTerminalRemediation } from '@/lib/cyber/dependencyRemediationPolicy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  if (!sameOriginCyberMutation(req)) return NextResponse.json({ ok: false, error: 'cross_origin_mutation_denied' }, { status: 403 })
  const ctx = guard.ctx as any
  const userId = ctx?.userId ?? ctx?.user?.id ?? ctx?.id ?? null
  if (!userId) return NextResponse.json({ ok: false, error: 'Authenticated user identity is required.' }, { status: 403 })
  let body: { remediationId?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const remediationId = String(body.remediationId || '').trim()
  if (!remediationId) return NextResponse.json({ ok: false, error: 'remediationId is required.' }, { status: 400 })
  const admin = getAdminSupabase()
  const source = await admin.from('remediation_requests')
    .select('source_type,source_area,status').eq('id', remediationId).eq('user_id', userId).maybeSingle()
  if (source.error || !source.data) return NextResponse.json({ ok: false, error: 'Remediation request not found.' }, { status: 404 })
  if (source.data.source_type === 'guardian_repository_change')
    return NextResponse.json({ ok: false, error: 'guardian_review_does_not_authorize_repair' }, { status: 409 })
  if (source.data.source_type !== 'dependency_scan' || source.data.source_area !== 'cybersecurity' || isTerminalRemediation(source.data))
    return NextResponse.json({ ok: false, error: 'Active dependency preparation is required.' }, { status: 409 })
  // The worker revalidates canonical scan evidence and scope. This endpoint is not
  // an approval bypass and deliberately writes no human-approval fields.
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: new URL(req.url).origin }
  const cookie = req.headers.get('cookie')
  if (cookie) headers.Cookie = cookie
  try {
    const res = await fetch(new URL('/api/hub/cyber/prepare-github-pr', req.url), {
      method: 'POST', headers, body: JSON.stringify({ remediationId }), cache: 'no-store',
    })
    const result = await res.json().catch(() => null)
    if (!res.ok || result?.ok !== true)
      return NextResponse.json({ ok: false, remediationId, error: result?.error || 'Preparation failed.' }, { status: res.ok ? 502 : res.status })
    return NextResponse.json({ ok: true, remediationId, preparation: result })
  } catch { return NextResponse.json({ ok: false, error: 'Preparation service unavailable.' }, { status: 502 }) }
}
