import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

type Decision = 'ok' | 'no' | 'hold' | 'staff' | 'package' | 'submitted' | 'published'

function normalizeDecision(value: unknown): Decision | null {
  if (value === 'ok' || value === 'no' || value === 'hold' || value === 'staff' || value === 'package' || value === 'submitted' || value === 'published') return value
  return null
}

function reviewValue(decision: Decision, existingReview: string) {
  if (decision === 'ok') return 'APPROVED'
  if (decision === 'no') return 'REJECTED'
  if (decision === 'hold' || decision === 'staff') return 'ON_HOLD'
  return existingReview || 'APPROVED'
}

function executionStage(decision: Decision, existingStage: string) {
  if (decision === 'ok') return 'approved'
  if (decision === 'no') return 'rejected'
  if (decision === 'hold') return 'on_hold'
  if (decision === 'staff') return 'staff_support'
  if (decision === 'package') return 'package_prepared'
  if (decision === 'submitted') return 'submitted'
  if (decision === 'published') return 'published'
  return existingStage || 'draft'
}

function rowStatus(decision: Decision) {
  if (decision === 'no') return 'rejected'
  if (decision === 'hold' || decision === 'staff') return 'draft'
  if (decision === 'published') return 'completed'
  return 'approved'
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

  const previous = ((existing?.metadata as any) || {})
  const now = new Date().toISOString()
  const liveUrl = String(body?.live_url || '').trim()
  const publicationDate = String(body?.publication_date || '').trim()
  const existingReview = String(previous.press_print_review || '')
  const existingStage = String(previous.press_print_execution_stage || '')
  const stage = executionStage(decision, existingStage)
  const status = rowStatus(decision)

  const execution = {
    ...((previous.press_print_execution && typeof previous.press_print_execution === 'object') ? previous.press_print_execution : {}),
    stage,
    package_prepared_at: decision === 'package' ? now : previous.press_print_execution?.package_prepared_at || null,
    submitted_at: decision === 'submitted' ? now : previous.press_print_execution?.submitted_at || null,
    published_at: decision === 'published' ? now : previous.press_print_execution?.published_at || null,
    live_url: liveUrl || previous.press_print_execution?.live_url || null,
    publication_date: publicationDate || previous.press_print_execution?.publication_date || null,
  }

  const metadata = {
    ...previous,
    press_print_review: reviewValue(decision, existingReview),
    press_print_review_scope: 'local_marketing_workspace',
    press_print_reviewed_at: ['ok', 'no', 'hold', 'staff'].includes(decision) ? now : previous.press_print_reviewed_at || now,
    press_print_execution_stage: stage,
    press_print_execution: execution,
    staff_support_available: true,
    staff_support_mode: decision === 'staff' ? true : (previous.staff_support_mode || false),
    staff_support_started_at: decision === 'staff' ? now : (previous.staff_support_started_at || null),
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

  return NextResponse.json({ ok: true, stage, status })
}
