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
}

export type PressCampaignInput = {
  created_by_role: PressCampaignRole
  media_target_type: PressMediaTargetType
  publication_contact: string
  content_body: string
  owner_email?: string
  owner_override_token?: string
  campaign_id?: string
}

const VALID_ROLES = new Set<PressCampaignRole>(['owner', 'staff'])
const VALID_TARGETS = new Set<PressMediaTargetType>(['newspaper_print', 'magazine_print', 'digital_press'])

export function validatePressCampaignInput(body: any): PressCampaignInput {
  const createdByRole = String(body?.created_by_role || '').trim() as PressCampaignRole
  const mediaTargetType = String(body?.media_target_type || '').trim() as PressMediaTargetType
  const publicationContact = String(body?.publication_contact || '').trim()
  const contentBody = String(body?.content_body || '').trim()
  const ownerEmail = String(body?.owner_email || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || '').trim()
  const ownerOverrideToken = String(body?.owner_override_token || '').trim()
  const campaignId = String(body?.campaign_id || body?.id || '').trim()

  if (!VALID_ROLES.has(createdByRole)) throw new Error('created_by_role must be owner or staff.')
  if (!VALID_TARGETS.has(mediaTargetType)) throw new Error('media_target_type must be newspaper_print, magazine_print, or digital_press.')
  if (!publicationContact) throw new Error('publication_contact is required.')
  if (!contentBody) throw new Error('content_body is required.')

  return {
    created_by_role: createdByRole,
    media_target_type: mediaTargetType,
    publication_contact: publicationContact,
    content_body: contentBody,
    owner_email: ownerEmail || undefined,
    owner_override_token: ownerOverrideToken || undefined,
    campaign_id: campaignId || undefined,
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

export async function dispatchPressProofEmail(campaign: PressCampaign, ownerEmail?: string) {
  const to = ownerEmail || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL
  const resendKey = process.env.RESEND_API_KEY
  if (!to || !resendKey) return { ok: false, skipped: true, reason: 'missing_email_configuration' }

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL || 'SignalBoost Press <press@signalboostapp.com>'
  await resend.emails.send({
    from,
    to,
    subject: `Press outreach proof published: ${campaign.media_target_type}`,
    text: [
      'SignalBoost Press & Print Outreach confirmation proof',
      `Campaign: ${campaign.id}`,
      `Publication target: ${campaign.media_target_type}`,
      `Publication contact: ${campaign.publication_contact}`,
      `Processing state: ${campaign.processing_state}`,
      '',
      campaign.content_body,
    ].join('\n'),
  })
  return { ok: true, skipped: false }
}

export async function runLocalPressDistributionWorker(campaign: PressCampaign, ownerEmail?: string) {
  console.info('[press-dispatch] local free organic distribution worker', {
    campaignId: campaign.id,
    mediaTargetType: campaign.media_target_type,
    publicationContact: campaign.publication_contact,
    processingState: campaign.processing_state,
  })
  return dispatchPressProofEmail(campaign, ownerEmail)
}
