import { getAdminSupabase } from '@/utils/supabase/server'
import {
  normalizeCampaignLearning,
  type CampaignLearningInput,
  type CampaignLearningRecord,
} from './campaignLearning'

export async function recordCampaignLearning(args: {
  organizationId: string
  campaignId: string
  learning: CampaignLearningInput
  now?: number
}): Promise<CampaignLearningRecord> {
  const organizationId = args.organizationId.trim()
  const campaignId = args.campaignId.trim()
  if (!organizationId || !campaignId) throw new Error('Campaign learning requires organization and campaign identities.')

  const learning = normalizeCampaignLearning(args.learning, args.now)
  const admin = getAdminSupabase()
  const executionStatus = learning.publishedAt || Object.keys(learning.publishedVersion).length
    ? 'published'
    : Object.keys(learning.approvedVersion).length
      ? 'approved'
      : 'draft'

  const { error } = await admin
    .from('enterprise_campaign_memory')
    .update({
      human_edits: learning.humanEdits,
      rejected_suggestions: learning.rejectedSuggestions,
      approved_version: Object.keys(learning.approvedVersion).length ? learning.approvedVersion : null,
      published_version: Object.keys(learning.publishedVersion).length ? learning.publishedVersion : null,
      performance_metrics: learning.metrics,
      performance_score: learning.performanceScore,
      cta: learning.winningCta,
      creative: learning.winningCreative,
      execution_status: executionStatus,
      published_at: learning.publishedAt,
      updated_at: new Date(args.now ?? Date.now()).toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('campaign_id', campaignId)

  if (error) throw new Error(error.message || 'Failed to persist campaign learning.')
  return learning
}
