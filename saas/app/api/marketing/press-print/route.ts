import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendPressPrintPreviewEmail } from '@/lib/marketing/pressPrintEmail'

export const dynamic = 'force-dynamic'

const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
type PressPrintChannel = typeof PRESS_PRINT_CHANNELS[number]

function isPressPrintChannel(value: unknown): value is PressPrintChannel {
  return typeof value === 'string' && PRESS_PRINT_CHANNELS.includes(value as PressPrintChannel)
}

function channelFromMetadata(metadata: Record<string, any> | null | undefined) {
  return String(metadata?.outreach_channel || metadata?.media_channel || '')
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .select('id,title,objective,status,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const campaigns = (data || []).filter((row: any) => isPressPrintChannel(channelFromMetadata(row.metadata)))
  return NextResponse.json({ ok: true, campaigns })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json().catch(() => ({}))
  const request = body?.request || {}
  const outreachChannel = String(request.outreach_channel || request.media_channel || '').trim()
  if (!isPressPrintChannel(outreachChannel)) {
    return NextResponse.json({ ok: false, error: 'Unsupported press or print media channel.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const title = String(request.title || 'Press & Print Media campaign').trim()
  const objective = String(request.objective || '').trim()
  const priority = String(request.priority || 'medium').trim()

  const row = {
    title,
    objective,
    summary: objective,
    department: 'marketing',
    channel: 'outreach',
    priority,
    status: 'draft',
    estimated_cost_usd: Number(request.estimatedCostUsd || 0),
    metadata: {
      source: 'press_print_staff_led_campaign',
      outreach_channel: outreachChannel,
      media_channel: outreachChannel,
      press_print_review: 'PENDING',
      press_print_review_scope: 'local_marketing_workspace',
      press_print_execution_stage: 'not_started',
      press_print_live_url_required: false,
      staff_support_available: true,
      owner_preview_required: true,
      owner_preview_email_sent_at: null,
      audience: String(request.audience || ''),
      signal: String(request.signal || ''),
    },
    created_at: now,
    updated_at: now,
  }

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .insert(row)
    .select('id,title,objective,status,metadata,created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const previewEmail = await sendPressPrintPreviewEmail({
    campaignId: data.id,
    title: data.title || title,
    objective: data.objective || objective,
    channel: outreachChannel,
    contact: String(request.signal || request.contact || request.publication || ''),
  })

  if (previewEmail.ok) {
    await ctx.admin
      .from('cos_campaign_queue')
      .update({ metadata: { ...((data.metadata as any) || {}), owner_preview_email_sent_at: new Date().toISOString(), owner_preview_email_status: 'sent' } })
      .eq('id', data.id)
  } else if (previewEmail.skipped || previewEmail.error) {
    await ctx.admin
      .from('cos_campaign_queue')
      .update({ metadata: { ...((data.metadata as any) || {}), owner_preview_email_status: previewEmail.reason || previewEmail.error || 'not_sent' } })
      .eq('id', data.id)
  }

  return NextResponse.json({ ok: true, campaign: data, previewEmail })
}
