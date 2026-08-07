// Guarded public wrapper around the existing prospect campaign worker.
// The core worker remains byte-for-byte unchanged; this boundary prevents a press,
// video, social, or ads brief from entering the sales prospecting queue.

import { classifyCampaignIntent } from '@/lib/outreach/campaignIntent'
import * as core from './prospectCampaignCore'

export type {
  ProspectCampaignStatus,
  ProspectCandidate,
  ProspectResult,
  ProspectCampaignJob,
} from './prospectCampaignCore'

export {
  getProspectCampaignJob,
  listProspectCampaignJobs,
  cancelProspectCampaignJob,
  draftMessageFor,
  advanceProspectCampaigns,
  summarizeProspectCampaign,
} from './prospectCampaignCore'

const WRONG_CONSOLE: Record<string, string> = {
  press: 'This reads as a press and media brief, not sales prospecting. Press campaigns run through the press pipeline and land for approval at /dashboard/marketing/press-drafts — publications are pitched, never emailed as sales prospects.',
  video: 'This reads as a video brief, not sales prospecting. Video campaigns are produced through the COSA pipeline and land for approval at /dashboard/cosa/video-pipeline.',
  social: 'This reads as a social media brief, not sales prospecting. Social posts run through the social publishing pipeline, not the outreach queue.',
  ads: 'This reads as a paid advertising brief, not sales prospecting. Paid campaigns carry a separate spend approval and never run as outreach drafts.',
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

type CoreInput = Parameters<typeof core.createProspectCampaignJob>[0]
export type CreateProspectCampaignInput = CoreInput & { brief?: string | null }

export async function createProspectCampaignJob(
  input: CreateProspectCampaignInput,
): ReturnType<typeof core.createProspectCampaignJob> {
  const offer = clean(input.offer, 2_000)
  const targetCriteria = clean(input.targetCriteria, 2_000)
  const routing = classifyCampaignIntent(clean(input.brief || '', 12_000) || `${offer}. ${targetCriteria}`)

  if (routing.pipeline && routing.pipeline !== 'prospect') {
    return { ok: false, error: `${WRONG_CONSOLE[routing.pipeline] || 'This does not read as a sales prospecting brief.'} Nothing was started and no company was contacted.` }
  }
  if (routing.decision === 'refuse') {
    return { ok: false, error: `${routing.reason} Nothing was started and no company was contacted.` }
  }

  const { brief: _brief, ...coreInput } = input
  return core.createProspectCampaignJob(coreInput)
}
