import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendPressPrintPreviewEmail } from '@/lib/marketing/pressPrintEmail'
import { checkPressAdmission } from '@/lib/marketing/pressCampaignAdmission'

export const dynamic = 'force-dynamic'

const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
type PressPrintChannel = typeof PRESS_PRINT_CHANNELS[number]
function isPressPrintChannel(value: unknown): value is PressPrintChannel { return typeof value === 'string' && PRESS_PRINT_CHANNELS.includes(value as PressPrintChannel) }
function channelFromMetadata(metadata: Record<string, any> | null | undefined) { return String(metadata?.outreach_channel || metadata?.media_channel || '') }
function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function buildPressQueueRow(args: { title: string; objective: string; outreachChannel: PressPrintChannel; audience: string; signal: string; now: string }) {
  const recommendationId = id('rec_press_print')
  return { recommendation_id: recommendationId, department: 'marketing', title: args.title, objective: args.objective, channel: 'outreach', audience: args.audience, languages: ['en'], assets: [], work_items: [{ id: id('work_press_print'), type: 'press_print_campaign', title: 'Manual staff-led Press & Print publication preview', status: 'drafted', input: { channel: args.outreachChannel, signal: args.signal }, output: { title: args.title, draft: args.objective } }], recommendation: { id: recommendationId, department: 'marketing', title: args.title, summary: args.objective, recommended_channel: 'outreach', priority: 'medium', confidence: 80, expected_roi: 'medium', estimated_cost_usd: 0, reason: 'Manual staff-led Press & Print campaign prepared for owner-gated workflow.', approval_status: 'pending_approval', created_at: args.now }, status: 'draft', risk_level: 'medium', approval_required: true, metadata: { source: 'press_print_staff_led_campaign', automation_mode: 'manual_staff_led', outreach_channel: args.outreachChannel, media_channel: args.outreachChannel, press_print_review: 'PENDING', press_print_review_scope: 'local_marketing_workspace', press_print_execution_stage: 'not_started', press_print_live_url_required: false, staff_support_available: true, owner_preview_required: true, owner_preview_email_sent_at: null, audience: args.audience, signal: args.signal, manual_staff_research_allowed: true }, created_at: args.now, updated_at: args.now }
}
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { data, error } = await ctx.admin.from('cos_campaign_queue').select('id,title,objective,status,metadata,created_at').order('created_at', { ascending: false }).limit(100)
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
  if (!isPressPrintChannel(outreachChannel)) return NextResponse.json({ ok: false, error: 'Unsupported press or print media channel.' }, { status: 400 })
  const now = new Date().toISOString()
  const title = String(request.title || 'Press & Print Media campaign').trim()
  const objective = String(request.objective || '').trim()
  const audience = String(request.audience || 'Publication editors, readers, and business technology buyers reached through the selected press media channel.').trim()
  const signal = String(request.signal || '').trim()

  // ADMISSION CONTROL. Everything else in the press workflow is a gate at the EXIT — the
  // cockpit hides Approve when there is no release, the decision route refuses to submit.
  // Those are correct and they left the queue filling with records that were never
  // admissible: a Unitarian congregation's guide about writing letters to the editor, a
  // Square blog post (approved and marked published), a record titled "Submission
  // Information", and three whose article notes were a pasted i18n audit report.
  //
  // Nine records had to be closed by hand because nothing checked them on the way IN. This
  // refuses with 400 and every reason, so the operator can correct the input and retry —
  // a gate, not a wall.
  const admission = checkPressAdmission({
    publicationName: String(request.publication || request.publication_name || request.publisher_name || '').trim(),
    publicationUrl: String(request.publication_url || request.publisher_url || '').trim(),
    editorEmail: String(request.contact || request.editor_email || request.publisher_email || signal || '').trim(),
    submissionFormUrl: String(request.submission_form_url || request.publisher_submission_form_url || '').trim(),
    articleNotes: String(request.article_notes || objective || '').trim(),
  })
  if (!admission.admitted) {
    return NextResponse.json({ ok: false, error: admission.summary, refusals: admission.refusals, codes: admission.codes }, { status: 400 })
  }

  const row = buildPressQueueRow({ title, objective, outreachChannel: outreachChannel as PressPrintChannel, audience, signal, now })
  const { data, error } = await ctx.admin.from('cos_campaign_queue').insert(row).select('id,title,objective,status,metadata,created_at').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const previewEmail = await sendPressPrintPreviewEmail({ campaignId: data.id, title: data.title || title, objective: data.objective || objective, channel: outreachChannel, contact: String(request.signal || request.contact || request.publication || '') })
  if (previewEmail.ok) await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...((data.metadata as any) || {}), owner_preview_email_sent_at: new Date().toISOString(), owner_preview_email_status: 'sent' } }).eq('id', data.id)
  else if (previewEmail.skipped || previewEmail.error) await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...((data.metadata as any) || {}), owner_preview_email_status: previewEmail.reason || previewEmail.error || 'not_sent' } }).eq('id', data.id)
  return NextResponse.json({ ok: true, campaign: data, previewEmail })
}
