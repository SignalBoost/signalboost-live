// saas/lib/cos/campaign-queue/measure.ts
// Fetches REAL post-publish performance for a campaign, using the SAME OAuth
// token already stored for publishing — youtube_channels was requested with
// the youtube.readonly scope, so no new credentials are needed. Honest by
// construction, matching the rest of this codebase: a platform with no
// readonly-capable token reports "not supported yet," never a fake number.

import { getValidSocialToken } from '../../outreach/social-token'
import type { SocialPlatform } from '../../outreach/social-connectors'

export type CampaignPerformanceMetrics = {
  platform: SocialPlatform
  videoId: string | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  fetchedAt: string
  supported: boolean
  error?: string
}

function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/[?&]v=([\w-]{6,})/) || String(url).match(/youtu\.be\/([\w-]{6,})/)
  return m ? m[1] : null
}

async function fetchYouTubeStats(accessToken: string, videoId: string): Promise<{ viewCount: number; likeCount: number; commentCount: number } | { error: string }> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data?.error?.message || `youtube_stats_failed_${res.status}` }
  const stats = data?.items?.[0]?.statistics
  if (!stats) return { error: 'video_not_found_or_private' }
  return {
    viewCount: Number(stats.viewCount || 0),
    likeCount: Number(stats.likeCount || 0),
    commentCount: Number(stats.commentCount || 0),
  }
}

/**
 * Measure real performance for one published platform entry on a campaign.
 * `ownerUserId` should be the user whose OAuth connection published it —
 * campaign.approved_by is the natural source, since that's the admin who
 * approved (and whose stored token was used to publish).
 */
export async function measureCampaignPerformance(args: {
  admin: any
  ownerUserId: string
  platform: SocialPlatform
  liveUrl: string | null
}): Promise<CampaignPerformanceMetrics> {
  const fetchedAt = new Date().toISOString()

  if (args.platform !== 'youtube_channels') {
    return {
      platform: args.platform,
      videoId: null,
      viewCount: null,
      likeCount: null,
      commentCount: null,
      fetchedAt,
      supported: false,
      error: `Performance measurement for ${args.platform} is not wired yet — its stored OAuth token was not requested with an analytics-capable scope.`,
    }
  }

  const videoId = extractYouTubeVideoId(args.liveUrl)
  if (!videoId) {
    return { platform: args.platform, videoId: null, viewCount: null, likeCount: null, commentCount: null, fetchedAt, supported: true, error: 'Could not extract a video id from the stored live URL.' }
  }

  const tok = await getValidSocialToken(args.admin, args.ownerUserId, args.platform)
  if (!tok.ok || !tok.accessToken) {
    return { platform: args.platform, videoId, viewCount: null, likeCount: null, commentCount: null, fetchedAt, supported: true, error: tok.error || 'No valid token to measure with.' }
  }

  const stats = await fetchYouTubeStats(tok.accessToken, videoId)
  if ('error' in stats) {
    return { platform: args.platform, videoId, viewCount: null, likeCount: null, commentCount: null, fetchedAt, supported: true, error: stats.error }
  }

  return {
    platform: args.platform,
    videoId,
    viewCount: stats.viewCount,
    likeCount: stats.likeCount,
    commentCount: stats.commentCount,
    fetchedAt,
    supported: true,
  }
}
