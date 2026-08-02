// saas/lib/outreach/social-connectors.ts
import { getSocialSecret, socialCredentialNames } from './social-secrets.ts'
import { getCustomPlatform, listCustomPlatforms, publishViaCustomPlatform } from './social-custom-platform.ts'
// Multi-platform social publishing adapter registry.
// Honest by construction: a post is reported as published only when the platform
// returns a genuine provider id. Missing tokens, destination refs, media, or API
// errors return ok:false and never create fake success records.

export type PublishMode = 'link' | 'native'

export type SocialPlatform =
  | 'facebook_pages'
  | 'instagram_business'
  | 'linkedin_company'
  // Posting from a PERSON'S own profile. Deliberately a separate connector rather than
  // a flag on linkedin_company: it needs a different OAuth scope (w_member_social vs
  // w_organization_social), a different author URN (urn:li:person vs urn:li:organization),
  // and — the reason it matters commercially — a completely different approval path.
  // Share on LinkedIn with w_member_social is free and self-serve; company-page posting
  // requires Community Management approval, a registered business and a verified Page,
  // which a startup buyer does not have on day one. Two cards on the cockpit, two honest
  // answers about what each requires.
  | 'linkedin_member'
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
  accountRef?: string
  title?: string
  description?: string
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
  publishMode?: PublishMode
}

export type SocialEngagementMetrics = { likes: number; shares: number; comments: number }
const NO_METRICS: SocialEngagementMetrics = { likes: 0, shares: 0, comments: 0 }

type RawPost = { id: string; url?: string | null }
type ContentKind = 'text' | 'media' | 'video'

type Adapter = {
  label: string
  authUrl: string
  tokenUrl?: string
  scopes: string[]
  needsAccountRef: boolean
  content: ContentKind
  userAgent?: string
  publish: (p: SocialPostPayload, accessToken: string) => Promise<RawPost>
  permalink: (id: string, accountRef?: string) => string | null
}

function creds(platform: SocialPlatform): { id?: string; secret?: string } {
  // Read through the host's resolver, not process.env directly. Default behaviour is
  // identical (the default resolver IS process.env); a buyer installs their vault once
  // and every connector follows without an edit here. See ./social-secrets.ts.
  const names = socialCredentialNames(platform)
  return { id: getSocialSecret(names.clientId), secret: getSocialSecret(names.clientSecret) }
}

function uploadMimeForVideoUrl(url: string, responseContentType: string | null): string {
  const cleanHeader = String(responseContentType || '').split(';')[0].trim().toLowerCase()
  if (cleanHeader.startsWith('video/')) return cleanHeader
  const cleanUrl = url.split('?')[0].toLowerCase()
  if (cleanUrl.endsWith('.mov')) return 'video/quicktime'
  if (cleanUrl.endsWith('.webm')) return 'video/webm'
  return 'video/mp4'
}

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

async function uploadVideoToYouTube(payload: SocialPostPayload, accessToken: string): Promise<RawPost> {
  if (!payload.videoUrl) throw new Error('youtube_requires_video')
  const videoRes = await fetch(payload.videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video from storage: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()
  const contentType = uploadMimeForVideoUrl(payload.videoUrl, videoRes.headers.get('content-type'))
  const contentLength = videoBuffer.byteLength
  const rawTitle = String(payload.title || payload.text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const ytTitle = (rawTitle.length > 100 ? rawTitle.slice(0, 97).trimEnd() + '…' : rawTitle) || 'Video'
  const metadata = { snippet: { title: ytTitle, description: payload.description || payload.text || '', tags: payload.tags || ['SignalBoost', 'AI', 'marketing'], categoryId: '22' }, status: { privacyStatus: payload.privacyStatus || 'public', selfDeclaredMadeForKids: false } }
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

async function publishFacebookVideo(p: SocialPostPayload, token: string): Promise<RawPost> {
  if (!p.videoUrl) throw new Error('facebook_video_requires_video')
  const res = await fetch(`https://graph.facebook.com/v20.0/${p.accountRef}/videos`, {
    method: 'POST',
    body: new URLSearchParams({ file_url: p.videoUrl, description: p.text || '', access_token: token }),
  })
  const d = await res.json().catch(() => ({} as any))
  if (!res.ok || d.error || !d.id) throw new Error(d?.error?.message || `facebook_video_failed_${res.status}`)
  return { id: String(d.id), url: `https://www.facebook.com/${d.id}` }
}

async function publishLinkedInVideo(p: SocialPostPayload, token: string, ownerUrn?: string): Promise<RawPost> {
  if (!p.videoUrl) throw new Error('linkedin_video_requires_video')
  const owner = ownerUrn || `urn:li:organization:${p.accountRef}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
  const videoRes = await fetch(p.videoUrl)
  if (!videoRes.ok) throw new Error(`linkedin_video_fetch_failed_${videoRes.status}`)
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
  const fileSizeBytes = videoBuffer.byteLength
  const initRes = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST', headers,
    body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes, uploadCaptions: false, uploadThumbnail: false } }),
  })
  const initData = await initRes.json().catch(() => ({} as any))
  const videoUrn = initData?.value?.video
  const uploadToken = initData?.value?.uploadToken || ''
  const instructions = Array.isArray(initData?.value?.uploadInstructions) ? initData.value.uploadInstructions : []
  if (!initRes.ok || !videoUrn || !instructions.length) throw new Error(initData?.message || `linkedin_video_init_failed_${initRes.status}`)
  const uploadedPartIds: string[] = []
  for (const ins of instructions) {
    const firstByte = Number(ins.firstByte || 0)
    const lastByte = Number(ins.lastByte >= 0 ? ins.lastByte : fileSizeBytes - 1)
    const chunk = videoBuffer.subarray(firstByte, lastByte + 1)
    const upRes = await fetch(String(ins.uploadUrl), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: chunk })
    if (!upRes.ok) throw new Error(`linkedin_video_chunk_failed_${upRes.status}`)
    const etag = upRes.headers.get('etag')
    if (etag) uploadedPartIds.push(etag.replace(/"/g, ''))
  }
  const finRes = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST', headers,
    body: JSON.stringify({ finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds } }),
  })
  if (!finRes.ok) { const e = await finRes.json().catch(() => ({} as any)); throw new Error(e?.message || `linkedin_video_finalize_failed_${finRes.status}`) }
  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers,
    body: JSON.stringify({ author: owner, commentary: p.text || '', visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { title: (p.title || 'Video').slice(0, 400), id: videoUrn } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }),
  })
  const id = postRes.headers.get('x-restli-id') || postRes.headers.get('x-linkedin-id')
  if (!postRes.ok || !id) { const e = await postRes.json().catch(() => ({} as any)); throw new Error(e?.message || `linkedin_video_post_failed_${postRes.status}`) }
  return { id, url: `https://www.linkedin.com/feed/update/${id}` }
}

export const ADAPTERS: Record<SocialPlatform, Adapter> = {
  youtube_channels: {
    label: 'YouTube Channels', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'], needsAccountRef: false, content: 'video',
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
  linkedin_member: {
    label: 'LinkedIn Profile', authUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    // openid/profile are what identify the member so the author URN can be resolved
    // without a second approval; w_member_social is the free self-serve posting scope.
    scopes: ['openid', 'profile', 'w_member_social'], needsAccountRef: true, content: 'text',
    publish: async (p, token) => {
      const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' },
        body: JSON.stringify({ author: `urn:li:person:${p.accountRef}`, commentary: p.text, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }),
      })
      const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id')
      if (!res.ok || !id) { const e = await res.json().catch(() => ({})); throw new Error(e?.message || `linkedin_member_publish_failed_${res.status}`) }
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
      let permalink: string | null = null
      try {
        const lRes = await fetch(`https://graph.facebook.com/v20.0/${pData.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)
        const lData = await lRes.json().catch(() => ({}))
        if (lRes.ok && lData.permalink) permalink = String(lData.permalink)
      } catch {}
      return { id: String(pData.id), url: permalink }
    },
    permalink: () => null,
  },
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
      return { id: String(publishId), url: 'https://www.tiktok.com/' }
    },
    permalink: () => 'https://www.tiktok.com/',
  },
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

export const SOCIAL_CONNECTORS: Record<SocialPlatform, { label: string; authUrl: string; scopes: string[]; rateLimit: string }> = Object.fromEntries(
  (Object.keys(ADAPTERS) as SocialPlatform[]).map((k) => [k, { label: ADAPTERS[k].label, authUrl: ADAPTERS[k].authUrl, scopes: ADAPTERS[k].scopes, rateLimit: `${ADAPTERS[k].label} API limits observed before publishing` }]),
) as Record<SocialPlatform, { label: string; authUrl: string; scopes: string[]; rateLimit: string }>

export function buildOAuthUrl(platform: SocialPlatform, redirectUri: string, state: string) {
  const a = adapterFor(platform)
  if (!a) throw new Error(`unknown_social_platform_${platform}`)
  const params = new URLSearchParams({ client_id: getSocialSecret(socialCredentialNames(platform).clientId) || 'configure-client-id', redirect_uri: redirectUri, response_type: 'code', scope: a.scopes.join(' '), state, access_type: 'offline', prompt: 'consent' })
  return `${a.authUrl}?${params.toString()}`
}

export function platformContentKind(platform: SocialPlatform): ContentKind { return adapterFor(platform)?.content || 'text' }
export function platformNeedsAccountRef(platform: SocialPlatform): boolean { return adapterFor(platform)?.needsAccountRef === true }

function failed(mode: string) { return { ok: false, providerPostId: '', liveUrl: null as string | null, metrics: NO_METRICS, mode } }

// UNIFORM HYBRID PUBLISH MODES — applies to EVERY provider.
// Each provider advertises the modes it supports and a safe default. 'link' posts
// the caption + tracking link to media hosted elsewhere; 'native' uploads the media
// into the post itself. Media-host providers (YouTube/TikTok/Instagram) are inherently
// native. Text-first providers (LinkedIn/Facebook) offer BOTH so a buyer picks per
// provider, changeable anytime, defaulting to the lean 'link' mode. Providers without
// a native uploader yet advertise 'link' only.
const PLATFORM_MODES: Record<SocialPlatform, { availableModes: PublishMode[]; defaultMode: PublishMode }> = {
  youtube_channels: { availableModes: ['native'], defaultMode: 'native' },
  tiktok: { availableModes: ['native'], defaultMode: 'native' },
  instagram_business: { availableModes: ['native'], defaultMode: 'native' },
  linkedin_company: { availableModes: ['link', 'native'], defaultMode: 'link' },
  linkedin_member: { availableModes: ['link', 'native'], defaultMode: 'link' },
  facebook_pages: { availableModes: ['link', 'native'], defaultMode: 'link' },
  twitter_x: { availableModes: ['link'], defaultMode: 'link' },
  reddit: { availableModes: ['link'], defaultMode: 'link' },
}

const NATIVE_PUBLISHERS: Partial<Record<SocialPlatform, (p: SocialPostPayload, accessToken: string) => Promise<RawPost>>> = {
  facebook_pages: publishFacebookVideo,
  linkedin_company: publishLinkedInVideo,
  linkedin_member: (p, token) => publishLinkedInVideo(p, token, `urn:li:person:${p.accountRef}`),
}

// ── Declared platforms ───────────────────────────────────────────────────────
//
// A buyer can declare any OAuth+REST platform at runtime (see ./social-custom-platform.ts).
// Every lookup below goes through adapterFor(), so a declared platform behaves exactly
// like a built-in one — same publish path, same confirmation rule, same gate — without
// this file knowing it exists.
function adapterFor(platform: SocialPlatform): Adapter | null {
  const builtIn = ADAPTERS[platform]
  if (builtIn) return builtIn

  const declared = getCustomPlatform(String(platform))
  if (!declared) return null

  return {
    label: declared.label,
    authUrl: declared.authUrl,
    tokenUrl: declared.tokenUrl,
    scopes: declared.scopes,
    needsAccountRef: declared.needsAccountRef === true,
    content: (declared.content || 'text') as ContentKind,
    publish: async (payload, accessToken) => {
      const result = await publishViaCustomPlatform(declared, payload, accessToken)
      return { id: result.id, url: result.url }
    },
    permalink: (id) => (declared.permalinkTemplate ? declared.permalinkTemplate.replace(/\{id\}/g, id) : null),
  }
}

/** Every platform available to publish to: the built-ins plus whatever the host declared. */
export function availableSocialPlatforms(): string[] {
  return [...Object.keys(ADAPTERS), ...listCustomPlatforms().map(item => item.id)]
}

// A declared platform publishes through its own body template, so it has one mode.
export function platformAvailableModes(platform: SocialPlatform): PublishMode[] { return PLATFORM_MODES[platform]?.availableModes || ['link'] }
export function platformDefaultMode(platform: SocialPlatform): PublishMode { return PLATFORM_MODES[platform]?.defaultMode || 'link' }
export function platformSupportsNativeVideo(platform: SocialPlatform): boolean { return platformAvailableModes(platform).includes('native') }

export async function publishSocialPost(payload: SocialPostPayload): Promise<{ ok: boolean; providerPostId: string; liveUrl: string | null; metrics: SocialEngagementMetrics; mode: string }> {
  if (!payload.text.trim() && !payload.imageUrl && !payload.videoUrl) throw new Error('Social post requires text, image, or video content.')
  const adapter = adapterFor(payload.platform)
  if (!adapter) return failed('unsupported_social_platform')
  const hasCreds = !!payload.accessToken || !!payload.refreshToken
  if (!hasCreds) return failed('oauth_credentials_not_configured')
  if (adapter.needsAccountRef && !payload.accountRef) return failed('account_ref_not_configured')
  if (adapter.content === 'video' && !payload.videoUrl) return failed(`${payload.platform}_requires_video`)
  if (adapter.content === 'media' && !payload.videoUrl && !payload.imageUrl) return failed(`${payload.platform}_requires_media`)

  try {
    let accessToken = payload.accessToken
    if (!accessToken && payload.refreshToken) {
      if (!adapter.tokenUrl) return failed('oauth_refresh_not_supported')
      accessToken = await refreshOAuth2(payload.platform, adapter.tokenUrl, payload.refreshToken)
    }
    // Uniform hybrid dispatch: buyer's chosen mode wins when the provider supports it,
    // else the provider default. Native uploads the video; on failure we fall back to a
    // link post wherever 'link' is available, so a post always goes out.
    const modeCfg = PLATFORM_MODES[payload.platform] || { availableModes: ['link'] as PublishMode[], defaultMode: 'link' as PublishMode }
    const requestedMode = payload.publishMode
    const mode: PublishMode = requestedMode && modeCfg.availableModes.includes(requestedMode) ? requestedMode : modeCfg.defaultMode
    const nativePublisher = NATIVE_PUBLISHERS[payload.platform]
    let raw: RawPost | null = null
    let nativeUsed = false
    if (mode === 'native' && nativePublisher && payload.videoUrl) {
      try {
        raw = await nativePublisher(payload, accessToken as string)
        nativeUsed = true
      } catch (nativeErr) {
        if (!modeCfg.availableModes.includes('link')) {
          return failed(`${payload.platform}_native_error:${nativeErr instanceof Error ? nativeErr.message : 'native_publish_failed'}`)
        }
        raw = null
      }
    }
    if (!raw) raw = await adapter.publish(payload, accessToken as string)
    if (!raw?.id) return failed(`${payload.platform}_no_id`)
    const liveUrl = raw.url || adapter.permalink(raw.id, payload.accountRef)
    return { ok: true, providerPostId: raw.id, liveUrl, metrics: NO_METRICS, mode: `${payload.platform}_${nativeUsed ? 'native_video' : 'live'}` }
  } catch (err) {
    return failed(`${payload.platform}_error:${err instanceof Error ? err.message : 'publish_failed'}`)
  }
}

export async function refreshSocialToken(platform: SocialPlatform, refreshToken: string): Promise<string> {
  const adapter = ADAPTERS[platform]
  if (!adapter?.tokenUrl) throw new Error(`${platform} does not support token refresh`)
  return refreshOAuth2(platform, adapter.tokenUrl, refreshToken)
}
