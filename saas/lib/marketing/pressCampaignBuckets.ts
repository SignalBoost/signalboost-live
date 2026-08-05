export type PressCampaignBucket = 'all' | 'pending' | 'approved' | 'sent' | 'published' | 'rejected'

export type PressCampaignState = {
  status?: string | null
  dispatch_state?: string | null
  published_url?: string | null
}

export function pressCampaignBucketOf(campaign: PressCampaignState): Exclude<PressCampaignBucket, 'all'> {
  const status = String(campaign.status || '')
  const dispatchState = String(campaign.dispatch_state || '')

  if (status === 'pending_owner_review') return 'pending'
  if (status === 'rejected') return 'rejected'
  if (status === 'published' || dispatchState === 'published' || Boolean(campaign.published_url)) return 'published'
  if (status === 'submitted' || status === 'scheduled' || dispatchState === 'submitted' || dispatchState === 'scheduled') return 'sent'
  return 'approved'
}
