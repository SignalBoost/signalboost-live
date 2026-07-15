// saas/lib/cos/campaign-queue/approvalBinding.ts
// Issue #205 Section 6.2 — bind approval to the exact reviewed campaign version.
// Single source of truth for: which language a campaign publishes in, which final
// branded video maps to a language, and a stable content hash of the human-approved
// publishable content. The publish gate verifies the live content still hashes to
// what was approved, so a post-approval edit cannot ride through on a stale flag.
//
// The hash intentionally covers only human-reviewed semantic content (objective,
// title, channel, languages, per-language draft/title, and the FINAL branded video
// URLs). It excludes volatile production fields (render status, attempt counters,
// timestamps) so that legitimate pipeline bookkeeping never invalidates an approval.

import { createHash } from 'node:crypto'

export function campaignLanguage(campaign: any): string {
  const langs = Array.isArray(campaign?.languages) ? campaign.languages.filter(Boolean).map(String) : []
  if (langs.length) return langs[0]
  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const first = items.find((it: any) => it?.input?.language)
  return first?.input?.language ? String(first.input.language) : ''
}

export function resolveFinalVideoForLanguage(campaign: any, language: string): string | null {
  const vmeta = campaign?.metadata?.video || {}
  const voiced = vmeta.voiced && typeof vmeta.voiced === 'object' ? vmeta.voiced : {}
  const brandedLangs = vmeta.brandedLangs && typeof vmeta.brandedLangs === 'object' ? vmeta.brandedLangs : {}
  if (language && brandedLangs[language] && voiced[language]) return String(voiced[language])
  const knownLangs = Array.from(new Set([
    ...(Array.isArray(campaign?.languages) ? campaign.languages.map(String) : []),
    ...Object.keys(brandedLangs),
    ...Object.keys(voiced),
  ].filter(Boolean)))
  if (knownLangs.length <= 1 && vmeta.branded === true && vmeta.voicedUrl) return String(vmeta.voicedUrl)
  return null
}

// Deterministic, stable serialization of only the reviewed publishable content.
function publishableContent(campaign: any) {
  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const perLanguage = items
    .filter((it: any) => it?.output)
    .map((it: any) => ({
      language: String(it?.input?.language || ''),
      draft: String(it?.output?.draft || ''),
      title: String(it?.output?.title || ''),
      finalVideo: resolveFinalVideoForLanguage(campaign, String(it?.input?.language || '')) || '',
    }))
    .sort((a: any, b: any) => (a.language < b.language ? -1 : a.language > b.language ? 1 : 0))

  const vmeta = campaign?.metadata?.video || {}

  return {
    objective: String(campaign?.objective || ''),
    title: String(campaign?.title || ''),
    channel: String(campaign?.channel || ''),
    languages: (Array.isArray(campaign?.languages) ? campaign.languages.map(String) : []).slice().sort(),
    perLanguage,
    videoBranded: vmeta.branded === true,
    videoVoicedUrl: String(vmeta.voicedUrl || ''),
  }
}

export function computeCampaignContentHash(campaign: any): string {
  const json = JSON.stringify(publishableContent(campaign))
  return createHash('sha256').update(json).digest('hex')
}

// Merge an approval record into a campaign's metadata (called at approval time).
export function withApprovalBinding(metadata: any, args: { approvedBy: string; contentHash: string }): Record<string, unknown> {
  return {
    ...(metadata || {}),
    approval: {
      ...((metadata && metadata.approval) || {}),
      approvedBy: args.approvedBy,
      approvedAt: new Date().toISOString(),
      contentHash: args.contentHash,
    },
  }
}

export type ApprovalCheck = { ok: boolean; reason?: string }

// Verify at publish time that the live content still matches what was approved.
export function verifyApprovalBinding(campaign: any): ApprovalCheck {
  const stored = campaign?.metadata?.approval?.contentHash
  if (!stored || typeof stored !== 'string') {
    return { ok: false, reason: 'This campaign has no approval binding. Re-approve it before publishing.' }
  }
  const current = computeCampaignContentHash(campaign)
  if (current !== stored) {
    return { ok: false, reason: 'Campaign content changed after approval. Re-approval is required before publishing.' }
  }
  return { ok: true }
}
