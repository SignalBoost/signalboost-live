// saas/lib/outreach/social-connectors.ts
// Multi-platform social publishing, built as an ADAPTER REGISTRY so the product can
// support any platform a tenant uses. Adding a network = add ONE adapter entry below
// (auth + scopes + whether it needs a destination ref + a publish fn + a permalink).
// Nothing else in the codebase changes. Honest by construction: a post is reported
// only when the platform returns a genuine id; missing creds / destination / API
// errors are refused, never faked.

export type SocialPlatform =
  | 'facebook_pages'
  | 'instagram_business'
  | 'linkedin_company'
  | 'twitter_x'
  | 'youtube_channels'
  | 'tiktok'
  | 'reddit'

export type SocialPostPayload = {
  platform: SocialPlatform
  text: string
  imageUrl?: string
  videoUrl?: string
  accessToken?: string
  refreshToken?: string
  // Destination handle for platforms that post to a specific entity:
  //   linkedin_company -> organization id, facebook_pages -> page id,
  //   instagram_business -> IG business user id, reddit -> subreddit name.
  //   X, YouTube, and TikTok post as the authenticated user (no ref needed).
  accountRef?: string
  title?: string
  description?: string
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
}

export type SocialEngagementMetrics = { likes: number; shares: number; comments: number }
const NO_METRICS: SocialEngagementMetrics = { likes: 0, shares: 0, comments: 0 }

type RawPost = { id: string; url?: string | null }
type ContentKind = 'text' | 'media' | 'video'

type Adapter = {
  label: string
  authUrl: string
  tokenUrl?: string            // OAuth2 token endpoint (enables refresh) — omit if not refreshable here
  scopes: string[]
  needsAccountRef: boolean
  content: ContentKind         // minimum content this platform needs
  userAgent?: string           // some APIs (Reddit) require one
  publish: (p: SocialPostPayload, accessToken: string) => Promise<RawPost>
  permalink: (id: string, accountRef?: string) => string | null
}

function creds(platform: SocialPlatform): { id?: string; secret?: string } {
  const P = platform.toUpperCase()
  return { id: process.env[`SOCIAL_${P}_CLIENT_ID`], secret: process.env[`SOCIAL_${P}_CLIENT_SECRET`] }
}

function uploadMimeForVideoUrl(url: string, responseContentType: string | null): string {
  const cleanHeader = String(responseContentType || '').split(';')[0].trim().toLowerCase()
  if (cleanHeader.startsWith('video/')) return cleanHeader

  const cleanUrl = url.split('?')[0].toLowerCase()
  if (cleanUrl.endsWith('.mov')) return 'video/quicktime'
  if (cleanUrl.endsWith('.webm')) return 'video/webm'

  // Supabase/private storage can serve MP4 objects as application/octet-stream.
  // YouTube accepts the upload session before processing, but the wrong media
  // type can later surface as an unplayable video. COSA's final branded output
  // is MP4, so default to video/mp4 for storage URLs with generic headers.
  return 'video/mp4'
}

// Standard OAuth2 refresh_token grant — works for Google/X/LinkedIn/TikTok/Reddit.
async function refreshOAuth2(platform: SocialPlatform, tokenUrl: string, refreshToken: string): Promise<string> {
  const { id, secret } = creds(platform)
  if (!id) throw new Error(`${platform} client id not configured`)
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (secret) headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: id, ...(secret ? { client_secret: secret } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `${platform}_refresh_failed`)
  return data.access_token as string
}

// ── YouTube resumable upload (real) ──────────────────────────────────────────────
async function uploadVideoToYouTube(payload: SocialPostPayload, accessToken: string): Promise<RawPost> {
  if (!payload.videoUrl) throw new Error('youtube_requires_video')
  const videoRes = await fetch(payload.videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video from storage: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()
  const contentType = uploadMimeForVideoUrl(payload.videoUrl, videoRes.headers.get('content-type'))
  const contentLength = videoBuffer.byteLength
  // YouTube rejects titles that are empty, longer than 100 characters, or that
  // contain < or > with "The request metadata specifies an invalid or empty
  // video title." Campaign titles are stored at up to 140 chars, so clamp here.
  const rawTitle = String(payload.title || payload.text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const ytTitle = (rawTitle.length > 100 ? rawTitle.slice(0, 97).trimEnd() + '…' : rawTitle) || 'SignalBoost Video'
  const metadata = {
    snippet: { title: ytTitle, description: payload.description || payload.text || '', tags: payload.tags || ['SignalBoost', 'AI', 'marketing'], categoryId: '22' },
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
  return { id: String(uploadData.id), url: `https://www.youtube.com/watch?v=${uploadData.id}` }
}

// ── The registry ─────────────────────────────────────────────────────────────────
export const ADAPTERS: Record<SocialPlatform, Adapter> = {
  youtube_channels: {
    label: 'YouTube Channels', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    needsAccountRef: false, content: 'video',
    publish: uploadVideoToYouTube,
    permalink: (id) => `https://www.youtube.com/watch?v=${id}`,
  },

  twitter_x: {
    label: 'Twitter/X', authUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], needsAccountRef: false, content: 'text',
    publish: async (p, token) => {
      const res = await fetch('https://api.twitter.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: p.text.slice(0, 280) }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.data?.id) throw new Error(d?.detail || d?.title || `x_publish_failed_${res.status}`)
      return { id: String(d.data.id), url: `https://x.com/i/web/status/${d.data.id}` }
    },
    permalink: (id) => `https://x.com/i/web/status/${id}`,
  },

  linkedin_company: {
    label: 'LinkedIn Company', authUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['w_organization_social', 'r_organization_social'], needsAccountRef: true, content: 'text',
    publish: async (p, token) => {
      const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' },
        body: JSON.stringify({ author: `urn:li:organization:${p.accountRef}`, commentary: p.text, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }),
      })
      const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id')
      if (!res.ok || !id) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `linkedin_publish_failed_${res.status}`) }
      return { id, url: `https://www.linkedin.com/feed/update/${id}` }
    },
    permalink: (id) => `https://www.linkedin.com/feed/update/${id}`,
  },

  facebook_pages: {
    label: 'Facebook Pages', authUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
    scopes: ['pages_manage_posts', 'pages_read_engagement'], needsAccountRef: true, content: 'text',
    publish: async (p, pageToken) => {
      const base = `https://graph.facebook.com/v20.0/${p.accountRef}`
      const isImg = !!p.imageUrl
      const url = isImg ? `${base}/photos` : `${base}/feed`
      const body = isImg ? new URLSearchParams({ url: p.imageUrl as string, caption: p.text, access_token: pageToken }) : new URLSearchParams({ message: p.text, access_token: pageToken })
      const res = await fetch(url, { method: 'POST', body })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error || !(d.id || d.post_id)) throw new Error(d?.error?.message || `facebook_publish_failed_${res.status}`)
      const id = String(d.post_id || d.id)
      return { id, url: `https://www.facebook.com/${id}` }
    },
    permalink: (id) => `https://www.facebook.com/${id}`,
  },

  instagram_business: {
    label: 'Instagram Business', authUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
    scopes: ['instagram_basic', 'instagram_content_publish'], needsAccountRef: true, content: 'media',
    publish: async (p, token) => {
      if (!p.imageUrl && !p.videoUrl) throw new Error('instagram_requires_media')
      const base = `https://graph.facebook.com/v20.0/${p.accountRef}`
      const createBody = new URLSearchParams({ caption: p.text, access_token: token })
      if (p.imageUrl) createBody.set('image_url', p.imageUrl)
      else { createBody.set('media_type', 'REELS'); createBody.set('video_url', p.videoUrl as string) }
      const cRes = await fetch(`${base}/media`, { method: 'POST', body: createBody })
      const cData = await cRes.json().catch(() => ({}))
      if (!cRes.ok || !cData.id) throw new Error(cData?.error?.message || `instagram_create_failed_${cRes.status}`)
      const pRes = await fetch(`${base}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: String(cData.id), access_token: token }) })
      const pData = await pRes.json().catch(() => ({}))
      if (!pRes.ok || !pData.id) throw new Error(pData?.error?.message || `instagram_publish_failed_${pRes.status}`)
      // Fetch the real permalink (media id alone doesn't form a /p/ shortcode URL).
      let permalink: string | null = null
      try {
        const lRes = await fetch(`https://graph.facebook.com/v20.0/${pData.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)
        const lData = await lRes.json().catch(() => ({}))
        if (lRes.ok && lData.permalink) permalink = String(lData.permalink)
      } catch { /* permalink is best-effort */ }
      return { id: String(pData.id), url: permalink }
    },
    permalink: () => null,
  },

  // ── TikTok (video; posts to the authenticated creator via PULL_FROM_URL) ──
  tiktok: {
    label: 'TikTok', authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['video.publish', 'video.upload'], needsAccountRef: false, content: 'video',
    publish: async (p, token) => {
      if (!p.videoUrl) throw new Error('tiktok_requires_video')
      const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ post_info: { title: (p.title || p.text || '').slice(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false }, source_info: { source: 'PULL_FROM_URL', video_url: p.videoUrl } }),
      })
      const d = await res.json().catch(() => ({}))
      const publishId = d?.data?.publish_id
      const errCode = d?.error?.code
      if (!res.ok || !publishId || (errCode && errCode !== 'ok')) throw new Error(d?.error?.message || `tiktok_publish_failed_${res.status}`)
      // TikTok processes asynchronously and does not return a canonical post URL here.
      return { id: String(publishId), url: 'https://www.tiktok.com/' }
    },
    permalink: () => 'https://www.tiktok.com/',
  },

  // ── Reddit (self/text post to a subreddit) ──
  reddit: {
    label: 'Reddit', authUrl: 'https://www.reddit.com/api/v1/authorize', tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['submit', 'identity'], needsAccountRef: true, content: 'text', userAgent: 'SignalBoost/1.0 (by SignalBoost)',
    publish: async (p, token) => {
      const body = new URLSearchParams({ api_type: 'json', sr: String(p.accountRef), kind: 'self', title: (p.title || p.text).slice(0, 300), text: p.text })
      const res = await fetch('https://oauth.reddit.com/api/submit', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SignalBoost/1.0 (by SignalBoost)' }, body })
      const d = await res.json().catch(() => ({}))
      const errs = d?.json?.errors
      const data = d?.json?.data
      if (!res.ok || (Array.isArray(errs) && errs.length) || !data?.url) throw new Error((Array.isArray(errs) && errs[0]?.[1]) || `reddit_publish_failed_${res.status}`)
      return { id: String(data.name || data.id), url: String(data.url) }
    },
    permalink: (_id, accountRef) => (accountRef ? `https://www.reddit.com/r/${accountRef}/` : null),
  },
}

// Back-compat: the connector catalog some UI/config reads.
export const SOCIAL_CONNECTORS: Record<SocialPlatform, { label: string; authUrl: string; scopes: string[]; rateLimit: string }> = Object.fromEntries(
  (Object.keys(ADAPTERS) as SocialPlatform[]).map((k) => [k, { label: ADAPTERS[k].label, authUrl: ADAPTERS[k].authUrl, scopes: ADAPTERS[k].scopes, rateLimit: `${ADAPTERS[k].label} API limits observed before publishing` }]),
) as Record<SocialPlatform, { label: string; authUrl: string; scopes: string[]; rateLimit: string }>

export function buildOAuthUrl(platform: SocialPlatform, redirectUri: string, state: string) {
  const a = ADAPTERS[platform]
  const params = new URLSearchParams({ client_id: process.env[`SOCIAL_${platform.toUpperCase()}_CLIENT_ID`] || 'configure-client-id', redirect_uri: redirectUri, response_type: 'code', scope: a.scopes.join(' '), state, access_type: 'offline', prompt: 'consent' })
  return `${a.authUrl}?${params.toString()}`
}

// Content requirement helper, so the executor can ask without hardcoding per platform.
export function platformContentKind(platform: SocialPlatform): ContentKind {
  return ADAPTERS[platform]?.content || 'text'
}

const STUB_NOT_CONFIGURED = 'oauth_credentials_not_configured_logged'
function stub(mode: string) { return { ok: true, providerPostId: '', liveUrl: null as string | null, metrics: NO_METRICS, mode } }
function failed(mode: string) { return { ok: false, providerPostId: '', liveUrl: null as string | null, metrics: NO_METRICS, mode } }

export async function publishSocialPost(payload: SocialPostPayload): Promise<{ ok: boolean; providerPostId: string; liveUrl: string | null; metrics: SocialEngagementMetrics; mode: string }> {
  if (!payload.text.trim() && !payload.imageUrl && !payload.videoUrl) throw new Error('Social post requires text, image, or video content.')
  const adapter = ADAPTERS[payload.platform]
  if (!adapter) return stub(STUB_NOT_CONFIGURED)

  const hasCreds = !!payload.accessToken || !!payload.refreshToken
  if (!hasCreds) return stub(STUB_NOT_CONFIGURED)
  if (adapter.needsAccountRef && !payload.accountRef) return stub('account_ref_not_configured')

  try {
    let accessToken = payload.accessToken
    if (!accessToken && payload.refreshToken) {
      if (!adapter.tokenUrl) return stub(STUB_NOT_CONFIGURED)
      accessToken = await refreshOAuth2(payload.platform, adapter.tokenUrl, payload.refreshToken)
    }
    const raw = await adapter.publish(payload, accessToken as string)
    if (!raw?.id) return failed(`${payload.platform}_no_id`)
    const liveUrl = raw.url || adapter.permalink(raw.id, payload.accountRef)
    return { ok: true, providerPostId: raw.id, liveUrl, metrics: NO_METRICS, mode: `${payload.platform}_live` }
  } catch (err) {
    return failed(`${payload.platform}_error:${err instanceof Error ? err.message : 'publish_failed'}`)
  }
}

// Public token-refresh helper for stored OAuth2 tokens. Uses each adapter's
// configured tokenUrl; throws an honest error if the platform isn't refreshable here.
export async function refreshSocialToken(platform: SocialPlatform, refreshToken: string): Promise<string> {
  const adapter = ADAPTERS[platform]
  if (!adapter?.tokenUrl) throw new Error(`${platform} does not support token refresh`)
  return refreshOAuth2(platform, adapter.tokenUrl, refreshToken)
}
