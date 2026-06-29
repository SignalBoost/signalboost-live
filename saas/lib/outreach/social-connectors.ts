// saas/lib/outreach/social-connectors.ts
export type SocialPlatform = 'facebook_pages' | 'instagram_business' | 'linkedin_company' | 'twitter_x' | 'youtube_channels'

export type SocialPostPayload = {
  platform: SocialPlatform
  text: string
  imageUrl?: string
  videoUrl?: string
  accessToken?: string
  refreshToken?: string
  // Destination handle for platforms that post to a specific entity:
  //   linkedin_company -> organization id, facebook_pages -> page id,
  //   instagram_business -> IG business user id. X and YouTube don't need it.
  accountRef?: string
  title?: string
  description?: string
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
}

export type SocialEngagementMetrics = {
  likes: number
  shares: number
  comments: number
}

const NO_METRICS: SocialEngagementMetrics = { likes: 0, shares: 0, comments: 0 }

export const SOCIAL_CONNECTORS: Record<SocialPlatform, { label: string; authUrl: string; scopes: string[]; rateLimit: string }> = {
  facebook_pages: { label: 'Facebook Pages', authUrl: 'https://www.facebook.com/v20.0/dialog/oauth', scopes: ['pages_manage_posts', 'pages_read_engagement'], rateLimit: 'Meta app/page limits observed before publishing' },
  instagram_business: { label: 'Instagram Business', authUrl: 'https://www.facebook.com/v20.0/dialog/oauth', scopes: ['instagram_basic', 'instagram_content_publish'], rateLimit: 'Instagram content publishing windows enforced' },
  linkedin_company: { label: 'LinkedIn Company', authUrl: 'https://www.linkedin.com/oauth/v2/authorization', scopes: ['w_organization_social', 'r_organization_social'], rateLimit: 'LinkedIn member and organization throttles enforced' },
  twitter_x: { label: 'Twitter/X', authUrl: 'https://twitter.com/i/oauth2/authorize', scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], rateLimit: 'X API app tier limits enforced' },
  youtube_channels: { label: 'YouTube Channels', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'], rateLimit: 'YouTube Data API quota checked before upload' },
}

export function buildOAuthUrl(platform: SocialPlatform, redirectUri: string, state: string) {
  const connector = SOCIAL_CONNECTORS[platform]
  const params = new URLSearchParams({
    client_id: process.env[`SOCIAL_${platform.toUpperCase()}_CLIENT_ID`] || 'configure-client-id',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: connector.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${connector.authUrl}?${params.toString()}`
}

function creds(platform: SocialPlatform): { id?: string; secret?: string } {
  const P = platform.toUpperCase()
  return { id: process.env[`SOCIAL_${P}_CLIENT_ID`], secret: process.env[`SOCIAL_${P}_CLIENT_SECRET`] }
}

// ── YouTube helpers (unchanged real path) ──────────────────────────────────────

async function refreshYouTubeToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.SOCIAL_YOUTUBE_CHANNELS_CLIENT_ID
  const clientSecret = process.env.SOCIAL_YOUTUBE_CHANNELS_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('YouTube OAuth credentials not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error_description || data.error || 'token_refresh_failed')
  return data
}

async function uploadVideoToYouTube(payload: SocialPostPayload, accessToken: string): Promise<string> {
  if (!payload.videoUrl) throw new Error('videoUrl is required for YouTube upload')
  const videoRes = await fetch(payload.videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video from storage: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()
  const contentType = videoRes.headers.get('content-type') || 'video/mp4'
  const contentLength = videoBuffer.byteLength

  const metadata = {
    snippet: { title: payload.title || payload.text.slice(0, 100) || 'SignalBoost Video', description: payload.description || payload.text || '', tags: payload.tags || ['SignalBoost', 'AI', 'marketing'], categoryId: '22' },
    status: { privacyStatus: payload.privacyStatus || 'public', selfDeclaredMadeForKids: false },
  }

  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': contentType, 'X-Upload-Content-Length': String(contentLength) },
    body: JSON.stringify(metadata),
  })
  if (!initRes.ok) { const e = await initRes.json().catch(() => ({})); throw new Error(e?.error?.message || `YouTube resumable init failed: ${initRes.status}`) }
  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL')

  const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': String(contentLength) }, body: videoBuffer })
  if (!uploadRes.ok) { const e = await uploadRes.json().catch(() => ({})); throw new Error(e?.error?.message || `YouTube video upload failed: ${uploadRes.status}`) }
  const uploadData = await uploadRes.json()
  return uploadData.id as string
}

// ── X / Twitter (real) ─────────────────────────────────────────────────────────

async function refreshOAuth2Token(tokenUrl: string, platform: SocialPlatform, refreshToken: string): Promise<string> {
  const { id, secret } = creds(platform)
  if (!id) throw new Error(`${platform} client id not configured`)
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  // Confidential clients authenticate with HTTP Basic; public clients send client_id in body.
  if (secret) headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
  const res = await fetch(tokenUrl, { method: 'POST', headers, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: id }) })
  const data = await res.json()
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `${platform}_refresh_failed`)
  return data.access_token as string
}

async function publishToX(payload: SocialPostPayload, accessToken: string): Promise<string> {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: payload.text.slice(0, 280) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.data?.id) throw new Error(data?.detail || data?.title || `x_publish_failed_${res.status}`)
  return String(data.data.id)
}

// ── LinkedIn organization post (real) ────────────────────────────────────────────

async function publishToLinkedIn(payload: SocialPostPayload, accessToken: string, orgId: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: `urn:li:organization:${orgId}`,
      commentary: payload.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id')
  if (!res.ok || !id) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `linkedin_publish_failed_${res.status}`) }
  return id
}

// ── Facebook Page post (real) ────────────────────────────────────────────────────

async function publishToFacebook(payload: SocialPostPayload, pageAccessToken: string, pageId: string): Promise<string> {
  const base = `https://graph.facebook.com/v20.0/${pageId}`
  let url: string
  let body: URLSearchParams
  if (payload.imageUrl) {
    url = `${base}/photos`
    body = new URLSearchParams({ url: payload.imageUrl, caption: payload.text, access_token: pageAccessToken })
  } else {
    url = `${base}/feed`
    body = new URLSearchParams({ message: payload.text, access_token: pageAccessToken })
  }
  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error || !(data.id || data.post_id)) throw new Error(data?.error?.message || `facebook_publish_failed_${res.status}`)
  return String(data.post_id || data.id)
}

// ── Instagram Business post (real, two-step) ──────────────────────────────────────

async function publishToInstagram(payload: SocialPostPayload, accessToken: string, igUserId: string): Promise<string> {
  if (!payload.imageUrl && !payload.videoUrl) throw new Error('instagram_requires_media')
  const base = `https://graph.facebook.com/v20.0/${igUserId}`
  const createBody = new URLSearchParams({ caption: payload.text, access_token: accessToken })
  if (payload.imageUrl) createBody.set('image_url', payload.imageUrl)
  else { createBody.set('media_type', 'REELS'); createBody.set('video_url', payload.videoUrl as string) }

  const createRes = await fetch(`${base}/media`, { method: 'POST', body: createBody })
  const createData = await createRes.json().catch(() => ({}))
  if (!createRes.ok || !createData.id) throw new Error(createData?.error?.message || `instagram_create_failed_${createRes.status}`)

  const pubRes = await fetch(`${base}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: String(createData.id), access_token: accessToken }) })
  const pubData = await pubRes.json().catch(() => ({}))
  if (!pubRes.ok || !pubData.id) throw new Error(pubData?.error?.message || `instagram_publish_failed_${pubRes.status}`)
  return String(pubData.id)
}

// ── Main publish function ──────────────────────────────────────────────────────

// A genuine post returns mode ending in `_live` (or `youtube_live_upload`). Any
// "not really posted" outcome returns one of these stub modes so the caller's
// honesty guard refuses to record a fake URL.
const STUB_NOT_CONFIGURED = 'oauth_credentials_not_configured_logged'

function stub(mode: string): { ok: boolean; providerPostId: string; metrics: SocialEngagementMetrics; mode: string } {
  return { ok: true, providerPostId: '', metrics: NO_METRICS, mode }
}
function live(id: string, mode: string) {
  return { ok: true, providerPostId: id, metrics: NO_METRICS, mode }
}
function failed(mode: string) {
  return { ok: false, providerPostId: '', metrics: NO_METRICS, mode }
}

export async function publishSocialPost(payload: SocialPostPayload): Promise<{ ok: boolean; providerPostId: string; metrics: SocialEngagementMetrics; mode: string }> {
  if (!payload.text.trim() && !payload.imageUrl && !payload.videoUrl) throw new Error('Social post requires text, image, or video content.')

  const hasCreds = !!payload.accessToken || !!payload.refreshToken

  try {
    switch (payload.platform) {
      // ── YouTube ──
      case 'youtube_channels': {
        if (!hasCreds) return stub(STUB_NOT_CONFIGURED)
        let accessToken = payload.accessToken
        if (!accessToken && payload.refreshToken) accessToken = (await refreshYouTubeToken(payload.refreshToken)).access_token
        if (!payload.videoUrl) return failed('youtube_requires_video')
        const videoId = await uploadVideoToYouTube(payload, accessToken as string)
        return live(videoId, 'youtube_live_upload')
      }

      // ── X / Twitter ── (no account ref needed; posts as the authenticated user)
      case 'twitter_x': {
        if (!hasCreds) return stub(STUB_NOT_CONFIGURED)
        let accessToken = payload.accessToken
        if (!accessToken && payload.refreshToken) accessToken = await refreshOAuth2Token('https://api.twitter.com/2/oauth2/token', 'twitter_x', payload.refreshToken)
        const id = await publishToX(payload, accessToken as string)
        return live(id, 'twitter_x_live')
      }

      // ── LinkedIn organization ──
      case 'linkedin_company': {
        if (!hasCreds) return stub(STUB_NOT_CONFIGURED)
        if (!payload.accountRef) return stub('account_ref_not_configured')
        let accessToken = payload.accessToken
        if (!accessToken && payload.refreshToken) accessToken = await refreshOAuth2Token('https://www.linkedin.com/oauth/v2/accessToken', 'linkedin_company', payload.refreshToken)
        const id = await publishToLinkedIn(payload, accessToken as string, payload.accountRef)
        return live(id, 'linkedin_company_live')
      }

      // ── Facebook Page ── (access token must be the PAGE token; ref = page id)
      case 'facebook_pages': {
        if (!payload.accessToken) return stub(STUB_NOT_CONFIGURED)
        if (!payload.accountRef) return stub('account_ref_not_configured')
        const id = await publishToFacebook(payload, payload.accessToken, payload.accountRef)
        return live(id, 'facebook_pages_live')
      }

      // ── Instagram Business ── (ref = IG business user id; requires media)
      case 'instagram_business': {
        if (!payload.accessToken) return stub(STUB_NOT_CONFIGURED)
        if (!payload.accountRef) return stub('account_ref_not_configured')
        const id = await publishToInstagram(payload, payload.accessToken, payload.accountRef)
        return live(id, 'instagram_business_live')
      }

      default:
        return stub(STUB_NOT_CONFIGURED)
    }
  } catch (err) {
    return failed(`${payload.platform}_error:${err instanceof Error ? err.message : 'publish_failed'}`)
  }
}
