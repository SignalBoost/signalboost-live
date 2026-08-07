// Guarded public wrapper around the existing press campaign worker.
// The core worker remains byte-for-byte unchanged; this boundary makes press admission
// explicit and refuses sales/video/social/ads briefs before any publication is queued.

import { classifyCampaignIntent, campaignIntentAllows } from '@/lib/outreach/campaignIntent'
import * as core from './pressCampaignCore'

export type {
  PressCampaignStatus,
  PressCandidate,
  PressJobResult,
  PressCampaignJob,
  PressCampaignRequest,
} from './pressCampaignCore'

export {
  announcementFrom,
  getPressCampaignJob,
  listPressCampaignJobs,
  cancelPressCampaignJob,
  advancePressCampaigns,
  describePressCampaignJob,
  pressCampaignQueuedReply,
} from './pressCampaignCore'

const WRONG_CONSOLE: Record<string, string> = {
  prospect: 'This reads as a sales prospecting brief, not press and media. Sales outreach drafts land for approval at /dashboard/outreach/contacts — publications are pitched, companies are sold to, and the two never share a queue.',
  video: 'This reads as a video brief, not press and media. Video campaigns are produced through the COSA pipeline and land for approval at /dashboard/cosa/video-pipeline.',
  social: 'This reads as a social media brief, not press and media. Social posts run through the social publishing pipeline.',
  ads: 'This reads as a paid advertising brief, not press and media. Paid campaigns carry a separate spend approval.',
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

type CoreInput = Parameters<typeof core.createPressCampaignJob>[0]
export type CreatePressCampaignInput = CoreInput & { brief?: string | null }

export async function createPressCampaignJob(
  input: CreatePressCampaignInput,
): ReturnType<typeof core.createPressCampaignJob> {
  const goal = clean(input.goal, 2_000)
  const routing = classifyCampaignIntent(clean(input.brief || '', 12_000) || goal)

  if (routing.pipeline && routing.pipeline !== 'press') {
    return { ok: false, error: `${WRONG_CONSOLE[routing.pipeline] || 'This does not read as a press and media brief.'} Nothing was started and no publication was contacted.` }
  }
  if (routing.decision === 'refuse') {
    return { ok: false, error: `${routing.reason} Nothing was started and no publication was contacted.` }
  }

  const { brief: _brief, ...coreInput } = input
  return core.createPressCampaignJob(coreInput)
}

export function parsePressCampaignRequest(
  input: string,
  language = 'en',
): ReturnType<typeof core.parsePressCampaignRequest> {
  const intent = classifyCampaignIntent(input)
  if (!campaignIntentAllows(intent, 'press')) return null
  return core.parsePressCampaignRequest(input, language)
}
