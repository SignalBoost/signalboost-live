import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

type Decision = 'ok' | 'no' | 'hold' | 'staff'

function normalizeDecision(value: unknown): Decision | null {
  if (value === 'ok' || value === 'no' || value === 'hold' || value === 'staff') return value
  return null
}

function reviewValue(decision: Decision) {
  if (decision === 'ok') return 'APPROVED'
  if (decision === 'no') return 'REJECTED'
  return 'ON_HOLD'
}

async function readPayload(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return req.json().catch(() => ({}))
  const form = await req.formData().catch(() => null)
  if (!form) return {}
  return Object.fromEntries(form.entries())
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const body: any = await readPayload(req)
  const id = String(body?.id || '').trim()
  const decision = normalizeDecision(String(body?.decision || ''))
  if (!id || !decision) return NextResponse.json({ ok: false, error: 'Missing decision data.' }, { status: 400 })

  const { data: existing, error: readError } = await ctx.admin
    .from('cos_campaign_queue')
    .select('metadata')
    .eq('id', id)
    .single()

  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 })

  const status = decision === 'no' ? 'rejected' : 'draft'
  const metadata = {
    ...((existing?.metadata as any) || {}),
    press_print_review: reviewValue(decision),
    press_print_review_scope: 'local_marketing_workspace',
    press_print_reviewed_at: new Date().toISOString(),
    staff_support_available: true,
    staff_support_mode: decision === 'staff' ? true : ((existing?.metadata as any)?.staff_support_mode || false),
    staff_support_started_at: decision === 'staff' ? new Date().toISOString() : ((existing?.metadata as any)?.staff_support_started_at || null),
  }

  const { error } = await ctx.admin
    .from('cos_campaign_queue')
    .update({ status, metadata })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const accept = req.headers.get('accept') || ''
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/dashboard/marketing/press-print', req.url), { status: 303 })
  }

  return NextResponse.json({ ok: true })
}
