import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export type PressCampaignStatus = 'draft' | 'pending_owner_review' | 'approved' | 'published' | 'rejected'
export type PressCampaignRole = 'owner' | 'staff'
export type PressMediaTargetType = 'newspaper_print' | 'magazine_print' | 'digital_press'
export type PressProcessingState = 'free_organic_distribution'

export type PressCampaign = {
  id: string
  status: PressCampaignStatus
  created_by_role: PressCampaignRole
  media_target_type: PressMediaTargetType
  publication_contact: string
  content_body: string
  processing_state: PressProcessingState
  updated_at: string
  source?: string | null
  channel?: string | null
  publication_name?: string | null
  editor_contact?: string | null
  headline?: string | null
  article_notes?: string | null
  cta_url?: string | null
  published_url?: string | null
  preview_sent_at?: string | null
  published_at?: string | null
}

export type PressCampaignInput = {
  action?: 'create' | 'approve' | 'reject'
  created_by_role: PressCampaignRole
  media_target_type: PressMediaTargetType
  publication_contact: string
  content_body: string
  owner_email?: string
  owner_override_token?: string
  campaign_id?: string
  source?: string
  channel?: string
  force_owner_review?: boolean
  publication_name?: string
  editor_contact?: string
  headline?: string
  article_notes?: string
  cta_url?: string
  published_url?: string
  live_url?: string
}

const VALID_ROLES = new Set<PressCampaignRole>(['owner', 'staff'])
const VALID_TARGETS = new Set<PressMediaTargetType>(['newspaper_print', 'magazine_print', 'digital_press'])

function clean(value: unknown, fallback = ''): string {
  const v = String(value ?? '').trim()
  return v || fallback
}

function targetFrom(body: any): PressMediaTargetType {
  const explicit = clean(body?.media_target_type) as PressMediaTargetType
  const channel = clean(body?.channel || body?.outreach_channel || body?.media_channel).toLowerCase()
  if (VALID_TARGETS.has(explicit)) return explicit
  if (channel.includes('print')) return 'newspaper_print'
  if (channel.includes('trade') || channel.includes('magazine')) return 'magazine_print'
  return 'digital_press'
}

function defaultChannel(target: PressMediaTargetType) {
  if (target === 'newspaper_print') return 'print-newspapers'
  if (target === 'magazine_print') return 'trade-press'
  return 'online-newspapers'
}

function buildContent(args: { channel: string; publication: string; contact: string; headline: string; notes: string; cta: string }) {
  return [
    `Channel: ${args.channel}`,
    `Publication name: ${args.publication}`,
    `Editor / media contact: ${args.contact}`,
    `Headline / campaign title: ${args.headline}`,
    '',
    'Article / ad notes:',
    args.notes,
    '',
    `Call to action: ${args.cta}`,
  ].join('\n')
}

export function validatePressCampaignInput(body: any): PressCampaignInput {
  const action = (body?.action === 'approve' || body?.action === 'reject') ? body.action : 'create'
  const ownerEmail = clean(body?.owner_email || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL)
  const ownerOverrideToken = clean(body?.owner_override_token)
  const campaignId = clean(body?.campaign_id || body?.id)

  if (action !== 'create') {
    if (!campaignId) throw new Error('campaign_id is required for approve/reject actions.')
    return {
      action,
      created_by_role: 'staff',
      media_target_type: 'digital_press',
      publication_contact: 'Existing campaign',
      content_body: 'Existing campaign approval action',
      owner_email: ownerEmail || undefined,
      owner_override_token: ownerOverrideToken || undefined,
      campaign_id: campaignId,
      published_url: clean(body?.published_url || body?.publication_url || body?.live_url) || undefined,
      live_url: clean(body?.live_url) || undefined,
    }
  }

  const createdByRole = clean(body?.created_by_role, 'staff') as PressCampaignRole
  const safeRole = VALID_ROLES.has(createdByRole) ? createdByRole : 'staff'
  const mediaTargetType = targetFrom(body)
  const channel = clean(body?.channel || body?.outreach_channel || body?.media_channel, defaultChannel(mediaTargetType))
  const publicationName = clean(body?.publication_name || body?.publication || body?.publicationName, channel === 'trade-press' ? 'IT magazines' : 'Target publication')
  const editorContact = clean(body?.editor_contact || body?.media_contact || body?.contact || body?.editorContact, 'Name, email, phone, media-kit link, or notes to be confirmed by COS')
  const headline = clean(body?.headline || body?.title, `SignalBoost introduces AI-powered business growth tools for ${publicationName}`)
  const ctaUrl = clean(body?.cta_url || body?.ctaUrl, 'https://saas.signalboostapp.com')
  const articleNotes = clean(body?.article_notes || body?.notes || body?.objective || body?.brief, `SignalBoost Client Suite helps businesses create websites, marketing assets, outreach campaigns, reviews, audio, and AI-guided workflows from one platform. Direct readers to ${ctaUrl}.`)
  const publicationContact = clean(body?.publication_contact, `${publicationName} — ${editorContact}`)
  const contentBody = clean(body?.content_body, buildContent({ channel, publication: publicationName, contact: editorContact, headline, notes: articleNotes, cta: ctaUrl }))

  return {
    action,
    created_by_role: safeRole,
    media_target_type: mediaTargetType,
    publication_contact: publicationContact,
    content_body: contentBody,
    owner_email: ownerEmail || undefined,
    owner_override_token: ownerOverrideToken || undefined,
    campaign_id: campaignId || undefined,
    source: clean(body?.source, safeRole === 'owner' ? 'manual_owner' : 'concierge_cos'),
    channel,
    force_owner_review: Boolean(body?.force_owner_review),
    publication_name: publicationName,
    editor_contact: editorContact,
    headline,
    article_notes: articleNotes,
    cta_url: ctaUrl,
    published_url: clean(body?.published_url || body?.publication_url || body?.live_url) || undefined,
    live_url: clean(body?.live_url) || undefined,
  }
}

export function getPressAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are not configured.')
  return createClient(url, key, { auth: { persistSession: false } })
}

export function ownerOverrideIsValid(token?: string) {
  const expected = process.env.PRESS_OWNER_OVERRIDE_TOKEN
  return Boolean(expected && token && token === expected)
}

function campaignLink(campaign: PressCampaign) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://saas.signalboostapp.com').replace(/\/$/, '')
  return campaign.published_url || `${base}/dashboard/marketing/press-outreach?campaign=${encodeURIComponent(campaign.id)}`
}

export async function dispatchPressProofEmail(campaign: PressCampaign, ownerEmail?: string) {
  const to = ownerEmail || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL
  const resendKey = process.env.RESEND_API_KEY
  if (!to || !resendKey) return { ok: false, skipped: true, reason: 'missing_email_configuration' }

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL || 'SignalBoost Press <press@signalboostapp.com>'
  const pending = campaign.status === 'pending_owner_review'
  await resend.emails.send({
    from,
    to,
    subject: pending ? `Owner approval required: ${campaign.headline || campaign.media_target_type}` : `Press outreach published: ${campaign.headline || campaign.media_target_type}`,
    text: [
      pending ? 'SignalBoost Press & Print preview is ready for owner approval.' : 'SignalBoost Press & Print publication confirmation.',
      `Campaign: ${campaign.id}`,
      `Publication target: ${campaign.media_target_type}`,
      `Publication contact: ${campaign.editor_contact || campaign.publication_contact}`,
      `Headline: ${campaign.headline || 'Not specified'}`,
      `Link: ${campaignLink(campaign)}`,
      '',
      campaign.content_body,
      '',
      pending ? 'Nothing is published until the owner approves it, unless the owner created it manually.' : '',
    ].filter(Boolean).join('\n'),
  })
  return { ok: true, skipped: false }
}

export async function runLocalPressDistributionWorker(campaign: PressCampaign, ownerEmail?: string) {
  console.info('[press-dispatch] COS-led press workflow', {
    campaignId: campaign.id,
    status: campaign.status,
    mediaTargetType: campaign.media_target_type,
    publicationContact: campaign.publication_contact,
    processingState: campaign.processing_state,
    link: campaignLink(campaign),
  })
  return dispatchPressProofEmail(campaign, ownerEmail)
}
