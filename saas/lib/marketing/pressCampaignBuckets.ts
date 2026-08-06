export type PressCampaignBucket = 'all' | 'pending' | 'approved' | 'sent' | 'published' | 'rejected'

export type PressCampaignState = {
  status?: string | null
  dispatch_state?: string | null
  dispatchState?: string | null
  published_url?: string | null
  publishedUrl?: string | null
}

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function pressCampaignBucketOf(campaign: PressCampaignState): Exclude<PressCampaignBucket, 'all'> {
  const status = normalize(campaign.status)
  const dispatchState = normalize(campaign.dispatch_state ?? campaign.dispatchState)
  const publishedUrl = String(campaign.published_url ?? campaign.publishedUrl ?? '').trim()

  // A rejected or failed dispatch must remain visibly rejected even if stale publication
  // evidence was accidentally retained on the record.
  if (status === 'rejected' || dispatchState === 'rejected' || dispatchState === 'failed') {
    return 'rejected'
  }
  if (publishedUrl || status === 'published' || dispatchState === 'published') {
    return 'published'
  }
  if (status === 'pending_owner_review') return 'pending'
  if (
    status === 'submitted' ||
    status === 'scheduled' ||
    dispatchState === 'submitted' ||
    dispatchState === 'scheduled'
  ) {
    return 'sent'
  }
  return 'approved'
}
