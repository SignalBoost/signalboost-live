// saas/app/api/marketing/press-print/route.ts
//
// PRESS & PRINT INTAKE — STRUCTURED FIELDS IN, A REAL RELEASE OUT.
//
// Two defects are closed here, both of which made this cockpit unusable rather than merely
// imperfect:
//
// 1. THE ADMISSION GATE WAS BEING FED PROSE. The only intake form flattened publication,
//    contact and notes into one sentence and posted it as `signal`. This route then read
//    request.publication (never sent) and fell back to `signal` for the editor address — so
//    checkPressAdmission judged "Direct Marketing workspace start. Publication=…; contact=…"
//    and refused it as not-a-publication. EVERY staff-led campaign was rejected with 400,
//    including real newspapers with real editorial addresses. The fallback to `signal` is gone:
//    admission now reads the fields the form actually sends, and nothing else.
//
// 2. NO CODE ANYWHERE WROTE A RELEASE. The cockpit and the decision route both gate approval
//    on metadata.press_release_body. Across the entire repo history that key has only ever
//    been READ — never written by anything — so Approve could never appear on any record, and
//    every campaign sat permanently at "No press release has been written". A gate with no
//    producer behind it is not a safety feature, it is a dead end.
//
// The release is generated through the SAME chokepoint the Press & Media portable uses —
// createAiPort() from press-media-host — so company facts and the factual-discipline preamble
// apply here exactly as they do there. No second engine, no parallel copywriter, and no second
// campaign record: press_campaigns stays the Press & Media portable's table.
//
// GENERATION IS NOT ALLOWED TO SWALLOW ITS OWN FAILURE. If the model is unavailable the record
// is still created — with press_release_status naming the reason — and the cockpit keeps
// saying, truthfully, that no release exists. `POST { action: 'generate_release', id }` then
// writes one without re-keying the campaign, and re-runs admission against the stored record
// first, so a record that should never have been admitted cannot acquire a release later.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendPressPrintPreviewEmail } from '@/lib/marketing/pressPrintEmail'
import { checkPressAdmission } from '@/lib/marketing/pressCampaignAdmission'
import { createAiPort } from '@/press-media-host'
import { mintApprovalIdentity } from '@/portable-kernel'

export const dynamic = 'force-dynamic'

const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
type PressPrintChannel = typeof PRESS_PRINT_CHANNELS[number]
const CHANNEL_LABELS: Record<PressPrintChannel, string> = {
  'online-newspapers': 'online newspaper / digital publisher',
  'print-newspapers': 'print newspaper',
  'trade-press': 'magazine / IT trade press',
}
const DEFAULT_AUDIENCE = 'Publication editors, readers, and business technology buyers reached through the selected press media channel.'

function isPressPrintChannel(value: unknown): value is PressPrintChannel { return typeof value === 'string' && PRESS_PRINT_CHANNELS.includes(value as PressPrintChannel) }
function channelFromMetadata(metadata: Record<string, any> | null | undefined) { return String(metadata?.outreach_channel || metadata?.media_channel || '') }
function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function str(value: unknown): string { return String(value ?? '').trim() }
function emailIn(value: string): string { return (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0] }
function urlIn(value: string): string { return (value.match(/https?:\/\/\S+/i) || [''])[0] }

// ── The fields the operator filled, read once and named once ──────────────────
interface PressFields {
  channel: PressPrintChannel
  publicationName: string
  publicationUrl: string
  editorEmail: string
  submissionFormUrl: string
  headline: string
  articleNotes: string
  ctaUrl: string
  audience: string
  language: string
}

function readFields(request: any, channel: PressPrintChannel): PressFields {
  // `contact` is one free box in the form: it may hold an address or a submission URL. It is
  // split by SHAPE rather than trusted as either, so a form URL is never mailed as an address.
  const contact = str(request.contact || request.editor_email || request.publisher_email)
  return {
    channel,
    publicationName: str(request.publication || request.publication_name || request.publisher_name),
    publicationUrl: str(request.publication_url || request.publisher_url),
    editorEmail: emailIn(contact) || emailIn(str(request.editor_email)),
    submissionFormUrl: str(request.submission_form_url || request.publisher_submission_form_url) || urlIn(contact),
    headline: str(request.headline || request.title),
    articleNotes: str(request.article_notes || request.notes),
    ctaUrl: str(request.cta_url) || 'https://saas.signalboostapp.com',
    audience: str(request.audience) || DEFAULT_AUDIENCE,
    language: str(request.language || request.lang) || 'en',
  }
}

// The BRIEF — what the campaign was asked to be. Assembled from named fields only, so a pasted
// chat message can never become the brief the way it did under the removed keyword router.
function buildBrief(f: PressFields): string {
  return [
    `Prepare a staff-led Press & Print Media campaign for ${f.publicationName}.`,
    f.editorEmail ? `Editorial contact: ${f.editorEmail}.` : '',
    f.submissionFormUrl ? `Submission form: ${f.submissionFormUrl}.` : '',
    `Submission method: ${f.editorEmail ? 'publisher/editor email' : 'publisher submission form'}.`,
    `Channel: ${CHANNEL_LABELS[f.channel]}.`,
    `Headline / campaign title: ${f.headline}.`,
    f.articleNotes ? `Article / ad notes: ${f.articleNotes}` : '',
    `CTA URL: ${f.ctaUrl}.`,
    `Target audience: ${f.audience}`,
    `Requested language: ${f.language}.`,
    'Safety rule: nothing is contacted, submitted or published until the owner approves this exact target and the generated release.',
  ].filter(Boolean).join(' ')
}

interface ReleaseResult { body: string; status: string }

// One call, one chokepoint. A thrown model error is reported as a status, never as a 500 and
// never as an empty release that would read as "written and blank".
async function generateRelease(f: PressFields): Promise<ReleaseResult> {
  try {
    const ai = createAiPort()
    const { creative } = await ai.generate(
      {
        goal: `${f.headline}${f.articleNotes ? `. ${f.articleNotes}` : ''}`,
        audience: f.audience,
        ctaUrl: f.ctaUrl,
        language: f.language,
      },
      {
        format: 'press_release',
        maxChars: 2400,
        tone: 'newsworthy and factual; no guaranteed-results claims',
        notes: `For ${CHANNEL_LABELS[f.channel]}${f.publicationName ? ` — ${f.publicationName}` : ''}. Write a complete, self-contained release an editor could run as-is. Use only facts given to you; invent no quote, statistic, customer or date.`,
      },
    )
    const body = str(creative)
    if (!body) return { body: '', status: 'not_generated: the model returned nothing' }
    return { body, status: 'generated' }
  } catch (error: any) {
    return { body: '', status: `not_generated: ${error?.message || 'the model could not be reached'}` }
  }
}

function buildPressQueueRow(args: { f: PressFields; brief: string; release: ReleaseResult; now: string }) {
  const { f, brief, release, now } = args
  const recommendationId = id('rec_press_print')
  const submissionTarget = f.editorEmail || f.submissionFormUrl
  // APPROVAL IDENTITY, minted once and carried for the record's life: which pipeline it belongs
  // to, a reference the owner can quote, and the date it entered the queue. The kind is what the
  // decision route checks before it will act, so a record without one cannot be approved here.
  const approval = mintApprovalIdentity('press_print', now)
  return {
    recommendation_id: recommendationId,
    department: 'marketing',
    title: f.headline,
    objective: brief,
    channel: 'outreach',
    audience: f.audience,
    languages: [f.language],
    assets: [],
    work_items: [{
      id: id('work_press_print'),
      type: 'press_print_campaign',
      title: 'Staff-led Press & Print publication preview',
      status: 'drafted',
      input: { channel: f.channel, publication_name: f.publicationName, submission_target: submissionTarget, cta_url: f.ctaUrl },
      // The DRAFT is the release when one exists. It used to be the brief, which is how a brief
      // came to be shown to the owner under the word "draft".
      output: { title: f.headline, draft: release.body || brief, call_to_action: f.ctaUrl },
    }],
    recommendation: {
      id: recommendationId, department: 'marketing', title: f.headline, summary: brief,
      recommended_channel: 'outreach', priority: 'medium', confidence: 80, expected_roi: 'medium', estimated_cost_usd: 0,
      reason: 'Staff-led Press & Print campaign prepared for owner-gated approval.',
      approval_status: 'pending_approval', created_at: now,
    },
    status: 'draft',
    risk_level: 'medium',
    approval_required: true,
    metadata: {
      source: 'press_print_staff_led_campaign',
      approval_kind: approval.kind,
      approval_ref: approval.ref,
      approval_requested_at: approval.requestedAt,
      approval_decided_at: null,
      approval_decision: null,
      // Staff-led, never paid. A paid mode is only ever authorized by a recorded person, and
      // no route may write one on a person's behalf.
      automation_mode: 'manual_staff_led',
      outreach_channel: f.channel, media_channel: f.channel,
      // The publisher target the cockpit renders and the decision route validates. Previously
      // these were read in two files and written in none, so no campaign ever had a target.
      publisher_name: f.publicationName,
      publication_name: f.publicationName,
      publisher_email: f.editorEmail || null,
      publisher_submission_form_url: f.submissionFormUrl || null,
      publisher_contact_method: f.editorEmail ? 'email' : 'online_form',
      publisher_discovery_source_url: f.publicationUrl || null,
      target_discovery_status: submissionTarget ? 'resolved' : 'unresolved',
      press_release_body: release.body || null,
      press_release_status: release.status,
      press_release_generated_at: release.body ? now : null,
      headline: f.headline, article_notes: f.articleNotes, cta_url: f.ctaUrl,
      press_print_review: 'PENDING', press_print_review_scope: 'local_marketing_workspace',
      press_print_execution_stage: 'not_started', press_print_live_url_required: false,
      staff_support_available: true, owner_preview_required: true,
      owner_preview_email_sent_at: null, audience: f.audience,
      signal: submissionTarget, manual_staff_research_allowed: true,
    },
    created_at: now, updated_at: now,
  }
}
