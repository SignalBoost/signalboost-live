// saas/app/api/marketing/press-print/decision/route.ts
//
// THE PIPELINE GUARD IS THE FIRST THING THIS ROUTE DOES.
//
// It used to load a row by id and approve it without ever asking whether that row was a press
// row. A video campaign id, or a social draft id, posted here was approved as a press campaign
// and picked up the press metadata on its way through. Two approval surfaces that can act on
// each other's records are one pipeline wearing two names, whatever the dashboards look like.
//
// So the route DECLARES the kind it may act on, the record declares its own, and
// assertApprovalKind refuses the mismatch and says where the record actually belongs. Records
// created before kinds existed carry no kind; for those the outreach channel is the fallback
// evidence, and it must independently say press-print or the record is refused.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendPressPrintPublishedEmail } from '@/lib/marketing/pressPrintEmail'
import { assertApprovalKind } from '@/portable-kernel'
export const dynamic = 'force-dynamic'
type Decision = 'ok' | 'no' | 'hold' | 'staff' | 'package' | 'submitted' | 'published'
const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press']
function normalizeDecision(value: unknown): Decision | null { return value === 'ok' || value === 'no' || value === 'hold' || value === 'staff' || value === 'package' || value === 'submitted' || value === 'published' ? value : null }
function looksLikePressPrintRow(metadata: Record<string, any>) { return PRESS_PRINT_CHANNELS.includes(String(metadata?.outreach_channel || metadata?.media_channel || '')) }
function reviewValue(decision: Decision, existingReview: string) { if (decision === 'ok') return 'APPROVED'; if (decision === 'no') return 'REJECTED'; if (decision === 'hold' || decision === 'staff') return 'ON_HOLD'; return existingReview || 'APPROVED' }
function executionStage(decision: Decision, existingStage: string) { if (decision === 'ok') return 'approved'; if (decision === 'no') return 'rejected'; if (decision === 'hold') return 'on_hold'; if (decision === 'staff') return 'staff_support'; if (decision === 'package') return 'package_prepared'; if (decision === 'submitted') return 'submitted_to_publisher'; if (decision === 'published') return 'published'; return existingStage || 'draft' }
function rowStatus(decision: Decision) { if (decision === 'no') return 'rejected'; if (decision === 'hold' || decision === 'staff') return 'draft'; if (decision === 'submitted') return 'running'; if (decision === 'published') return 'completed'; return 'approved' }
async function readPayload(req: NextRequest) { const contentType = req.headers.get('content-type') || ''; if (contentType.includes('application/json')) return req.json().catch(() => ({})); const form = await req.formData().catch(() => null); if (!form) return {}; return Object.fromEntries(form.entries()) }
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(); if (ctx instanceof NextResponse) return ctx
  const body: any = await readPayload(req); const id = String(body?.id || '').trim(); const decision = normalizeDecision(String(body?.decision || ''))
  if (!id || !decision) return NextResponse.json({ ok: false, error: 'Missing decision data.' }, { status: 400 })
  const { data: existing, error: readError } = await ctx.admin.from('cos_campaign_queue').select('title,objective,metadata').eq('id', id).single()
  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 })
  const previous = ((existing?.metadata as any) || {})

  // PIPELINE GUARD — before any decision is computed, before anything is written.
  const kindCheck = assertApprovalKind('press_print', previous.approval_kind, looksLikePressPrintRow(previous))
  if (!kindCheck.ok) return NextResponse.json({ ok: false, error: kindCheck.error, home: kindCheck.home }, { status: 409 })

  const now = new Date().toISOString(); const liveUrl = String(body?.live_url || '').trim(); const publicationDate = String(body?.publication_date || '').trim(); const existingReview = String(previous.press_print_review || ''); const existingStage = String(previous.press_print_execution_stage || ''); const stage = executionStage(decision, existingStage); const status = rowStatus(decision)
  const publisherName = String(previous.publisher_name || previous.publication_name || ''); const publisherEmail = String(previous.publisher_email || ''); const publisherFormUrl = String(previous.publisher_submission_form_url || ''); const submissionTarget = publisherEmail || publisherFormUrl
  const verifiedTarget = Boolean(previous.target_discovery_status === 'resolved' && publisherName && submissionTarget); const manualStaffLed = previous.automation_mode === 'manual_staff_led'; const paidUserRequested = previous.automation_mode === 'automated_paid_user_requested'; const freeAutomated = previous.automation_mode === 'automated_free_only' || !previous.automation_mode
  // A PAID MODE IS A CLAIM UNTIL SOMEONE SIGNED FOR IT. automation_mode is written upstream and
  // can be produced by generated content, so on its own it authorizes nothing: it merely turns
  // OFF the free-only advertising block below, which is exactly backwards. Authorization means a
  // recorded person and a recorded time. Without both, the campaign is treated as free-only —
  // failing CLOSED — and no decision that could reach a publisher is allowed through.
  const paidAuthorized = Boolean(paidUserRequested && String(previous.paid_requested_by || '').trim() && String(previous.paid_requested_at || '').trim()); const paidUnverified = paidUserRequested && !paidAuthorized
  if (paidUnverified && (decision === 'ok' || decision === 'submitted' || decision === 'published')) return NextResponse.json({ ok: false, error: 'This campaign is marked as a paid/advertising target, but no record exists of who requested paid placement or when. Approval and submission are blocked until that request is recorded. Reject it, or route it to staff support.' }, { status: 400 })
  // NO RELEASE, NO APPROVAL. These records store the BRIEF in `objective`; a press release only
  // exists if the press-media engine generated one. Approving without a release does not approve
  // nothing — it approves sending the brief, including whatever notes were pasted into it, to a
  // real editor. The UI hides the button; this is the half that cannot be replayed past.
  const releaseBody = String(previous.press_release_body || previous.content_body || previous.press_print_execution?.release_body || '').trim()
  if (!releaseBody && (decision === 'ok' || decision === 'submitted' || decision === 'published')) return NextResponse.json({ ok: false, error: 'No press release has been written for this campaign — only the brief exists. Approval and submission are blocked until a release is generated and reviewed.' }, { status: 400 })
  if ((decision === 'submitted' || decision === 'published') && !verifiedTarget && !manualStaffLed) return NextResponse.json({ ok: false, error: 'Missing verified free publisher target. Cannot submit/publish automated Press & Print campaign.' }, { status: 400 })
  if ((decision === 'submitted' || decision === 'published') && (freeAutomated || paidUnverified) && /advertis|media-kit|mediakit|sponsor|rate-card|rates/i.test(submissionTarget)) return NextResponse.json({ ok: false, error: 'Paid/advertising target is blocked for default free Press & Print. User must explicitly request paid advertising.' }, { status: 400 })
  const execution = { ...((previous.press_print_execution && typeof previous.press_print_execution === 'object') ? previous.press_print_execution : {}), stage, package_prepared_at: decision === 'package' ? now : previous.press_print_execution?.package_prepared_at || null, submitted_at: decision === 'submitted' ? now : previous.press_print_execution?.submitted_at || null, submitted_to: decision === 'submitted' ? submissionTarget : previous.press_print_execution?.submitted_to || null, submitted_to_publisher: decision === 'submitted' ? publisherName : previous.press_print_execution?.submitted_to_publisher || null, published_at: decision === 'published' ? now : previous.press_print_execution?.published_at || null, live_url: liveUrl || previous.press_print_execution?.live_url || null, live_url_required: false, live_url_status: liveUrl ? 'provided' : 'not_provided', publication_date: publicationDate || previous.press_print_execution?.publication_date || null }
  let publishedEmail: unknown = null
  if (decision === 'published') publishedEmail = await sendPressPrintPublishedEmail({ campaignId: id, title: existing?.title || 'Press & Print campaign', objective: existing?.objective || previous.signal || '', channel: String(previous.outreach_channel || previous.media_channel || 'press-print'), contact: String(previous.signal || ''), liveUrl: liveUrl || execution.live_url || undefined, publicationDate: publicationDate || execution.publication_date || undefined })
  // The DECISION date is recorded separately from the REQUESTED date the record was minted with.
  // "When was this approved" and "when did it enter the queue" are different questions and an
  // audit that cannot tell them apart cannot reconstruct how long anything waited.
  const metadata = { ...previous, approval_kind: 'press_print', approval_decided_at: ['ok', 'no', 'hold', 'staff'].includes(decision) ? now : previous.approval_decided_at || null, approval_decision: ['ok', 'no', 'hold', 'staff'].includes(decision) ? decision : previous.approval_decision || null, press_print_review: reviewValue(decision, existingReview), press_print_review_scope: 'local_marketing_workspace', press_print_reviewed_at: ['ok', 'no', 'hold', 'staff'].includes(decision) ? now : previous.press_print_reviewed_at || now, press_print_execution_stage: stage, press_print_execution: execution, press_print_live_url_required: false, staff_support_available: true, staff_support_mode: decision === 'staff' ? true : (previous.staff_support_mode || false), staff_support_started_at: decision === 'staff' ? now : (previous.staff_support_started_at || null), publisher_submission_status: decision === 'submitted' ? 'submitted' : previous.publisher_submission_status || null, publisher_submitted_at: decision === 'submitted' ? now : previous.publisher_submitted_at || null, publisher_submitted_to: decision === 'submitted' ? submissionTarget : previous.publisher_submitted_to || null, paid_user_requested: paidAuthorized || previous.paid_user_requested || false, owner_published_email_sent_at: decision === 'published' && (publishedEmail as any)?.ok ? now : previous.owner_published_email_sent_at || null, owner_published_email_status: decision === 'published' ? ((publishedEmail as any)?.ok ? 'sent' : ((publishedEmail as any)?.reason || (publishedEmail as any)?.error || 'not_sent')) : previous.owner_published_email_status || null }
  const { error } = await ctx.admin.from('cos_campaign_queue').update({ status, metadata }).eq('id', id); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const accept = req.headers.get('accept') || ''; if (accept.includes('text/html')) return NextResponse.redirect(new URL('/dashboard/marketing/press-print', req.url), { status: 303 })
  return NextResponse.json({ ok: true, stage, status, live_url_required: false, publishedEmail })
}
