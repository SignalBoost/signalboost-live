import { type SocialPlatform } from './social-connectors'

export type SocialDestination = {
  platform: SocialPlatform
  accountRef: string
  accountName: string | null
  kind: string
  accessToken?: string | null
  metadata?: Record<string, unknown>
}

async function readJson(res: Response) {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return { raw: text } }
}

function unique(destinations: SocialDestination[]) {
  const seen = new Set<string>()
  return destinations.filter(item => {
    const key = `${item.platform}:${item.accountRef}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function googleYouTube(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.error?.message || `youtube_destination_discovery_failed_${res.status}`)
  return (data.items || []).map((item: any) => ({ platform: 'youtube_channels' as const, accountRef: String(item.id), accountName: item?.snippet?.title || null, kind: 'youtube_channel', metadata: { raw: item } }))
}

async function xMe(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.detail || data?.title || `x_destination_discovery_failed_${res.status}`)
  const user = data?.data
  return user?.id ? [{ platform: 'twitter_x' as const, accountRef: String(user.id), accountName: user.username || user.name || null, kind: 'x_user', metadata: { raw: user } }] : []
}

async function facebookPages(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.error?.message || `facebook_destination_discovery_failed_${res.status}`)
  return (data.data || []).map((page: any) => ({ platform: 'facebook_pages' as const, accountRef: String(page.id), accountName: page.name || null, kind: 'facebook_page', accessToken: page.access_token || null, metadata: { raw: page } }))
}

async function instagramBusiness(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.error?.message || `instagram_destination_discovery_failed_${res.status}`)
  return (data.data || [])
    .filter((page: any) => page?.instagram_business_account?.id)
    .map((page: any) => ({
      platform: 'instagram_business' as const,
      accountRef: String(page.instagram_business_account.id),
      accountName: page.instagram_business_account.username || page.instagram_business_account.name || page.name || null,
      kind: 'instagram_business_account',
      accessToken: page.access_token || null,
      metadata: { pageId: page.id, pageName: page.name, raw: page.instagram_business_account },
    }))
}

async function redditIdentity(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://oauth.reddit.com/api/v1/me', { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SignalBoost/1.0 (by SignalBoost)' }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.message || `reddit_identity_discovery_failed_${res.status}`)
  // Reddit publishing still needs a subreddit destination. We record identity as a
  // discovered account but do not auto-select it as the subreddit destination.
  return data?.name ? [{ platform: 'reddit' as const, accountRef: String(data.name), accountName: data.name, kind: 'reddit_user_identity', metadata: { manualSubredditRequired: true, raw: data } }] : []
}

async function tiktokMe(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok || data?.error?.code && data.error.code !== 'ok') throw new Error(data?.error?.message || `tiktok_destination_discovery_failed_${res.status}`)
  const user = data?.data?.user
  return user?.open_id ? [{ platform: 'tiktok' as const, accountRef: String(user.open_id), accountName: user.display_name || null, kind: 'tiktok_creator', metadata: { raw: user } }] : []
}

async function linkedinOrganizations(accessToken: string): Promise<SocialDestination[]> {
  const res = await fetch('https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', {
    headers: { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' },
    cache: 'no-store',
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data?.message || `linkedin_destination_discovery_failed_${res.status}`)
  const elements = Array.isArray(data?.elements) ? data.elements : []
  return elements.map((item: any) => {
    const org = String(item.organization || '').replace('urn:li:organization:', '')
    return org ? { platform: 'linkedin_company' as const, accountRef: org, accountName: null, kind: 'linkedin_organization', metadata: { raw: item } } : null
  }).filter(Boolean) as SocialDestination[]
}

export async function discoverSocialDestinations(platform: SocialPlatform, accessToken: string): Promise<{ ok: boolean; mode: string; destinations: SocialDestination[]; error?: string }> {
  try {
    const destinations = platform === 'youtube_channels' ? await googleYouTube(accessToken)
      : platform === 'twitter_x' ? await xMe(accessToken)
      : platform === 'facebook_pages' ? await facebookPages(accessToken)
      : platform === 'instagram_business' ? await instagramBusiness(accessToken)
      : platform === 'reddit' ? await redditIdentity(accessToken)
      : platform === 'tiktok' ? await tiktokMe(accessToken)
      : platform === 'linkedin_company' ? await linkedinOrganizations(accessToken)
      : []
    return { ok: true, mode: 'live_provider_discovery', destinations: unique(destinations) }
  } catch (err: any) {
    return { ok: false, mode: 'manual_destination_required', destinations: [], error: err?.message || 'destination_discovery_failed' }
  }
}
