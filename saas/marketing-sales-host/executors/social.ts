// saas/marketing-sales-host/executors/social.ts
// Registry-driven multi-platform connector. It registers ONE executor per adapter
// in lib/outreach/social-connectors.ADAPTERS, so the platform list grows by adding
// an adapter there — this file never changes. Two enterprise-ready properties hold:
//   1) Credentials resolve PER ORG via resolveOrgToken() — the single seam an
//      enterprise host swaps to feed each tenant's own connected accounts.
//   2) Honest by construction: a post is recorded only when the platform returns a
//      genuine id (mode ends in `_live`). Missing creds / destination / API errors are
//      refused (errNotConnected) so a fake URL is NEVER recorded. A platform lights up
//      automatically the moment its real publish path returns a real id.
import { publishSocialPost, ADAPTERS, platformContentKind, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { registerExecutor } from '@/marketing-sales-core'
import type { Draft, MarketingHost } from '@/marketing-sales-core/types'
import type { PublishResult } from '@/marketing-sales-core/executors/types'

// Stable connector ids for the platforms that already had them; new platforms use
// their key. The marketing-sales publish flow refers to these ids.
const ID_BY_PLATFORM: Partial<Record<SocialPlatform, string>> = {
  youtube_channels: 'youtube',
  linkedin_company: 'linkedin',
  facebook_pages: 'facebook',
  instagram_business: 'instagram',
  twitter_x: 'twitter',
}
const idFor = (p: SocialPlatform) => ID_BY_PLATFORM[p] || p

// Best-effort home reference so a genuinely-published post is always recordable even
// when a platform doesn't return a canonical permalink synchronously (e.g. TikTok).
const PLATFORM_HOME: Record<SocialPlatform, string> = {
  youtube_channels: 'https://www.youtube.com/',
  twitter_x: 'https://x.com/',
  linkedin_company: 'https://www.linkedin.com/',
  facebook_pages: 'https://www.facebook.com/',
  instagram_business: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/',
  reddit: 'https://www.reddit.com/',
}

async function resolveOrgToken(host: MarketingHost, orgId: string, platform: SocialPlatform): Promise<{ refresh_token?: string; access_token?: string; account_ref?: string } | null> {
  try {
    const rows = await host.store.select('outreach_social_tokens', { platform })
    if (!Array.isArray(rows) || !rows.length) return null
    return rows[rows.length - 1] as any
  } catch { return null }
}

async function orgOf(host: MarketingHost): Promise<string> {
  try { const a = await host.auth.getCurrentActor(); return a?.orgId || 'signalboost' } catch { return 'signalboost' }
}

for (const platform of Object.keys(ADAPTERS) as SocialPlatform[]) {
  const kind = platformContentKind(platform)
  registerExecutor({
    id: idFor(platform),
    capabilities: { publish: true },
    async run(draft: Draft, host: MarketingHost): Promise<PublishResult> {
      if (kind === 'video' && !draft?.asset_url) return { ok: false, errorCode: 'errNoAsset', error: 'video required' }
      if (kind === 'media' && !draft?.asset_url) return { ok: false, errorCode: 'errNoAsset', error: 'media required' }
      if (kind === 'text' && !(draft?.body || draft?.title)) return { ok: false, errorCode: 'errUnknown', error: 'empty draft' }

      const tok = await resolveOrgToken(host, await orgOf(host), platform)
      if (!tok || (!tok.refresh_token && !tok.access_token)) {
        return { ok: false, errorCode: 'errNotConnected', error: `${platform} not connected` }
      }

      let res: any
      try {
        res = await publishSocialPost({
          platform,
          text: [draft.title, draft.body].filter(Boolean).join('\n\n'),
          title: (draft.title || '').slice(0, 95),
          description: draft.body || '',
          videoUrl: kind === 'video' ? (draft.asset_url || undefined) : undefined,
          imageUrl: kind === 'media' ? (draft.asset_url || undefined) : undefined,
          refreshToken: tok.refresh_token,
          accessToken: tok.access_token,
          accountRef: tok.account_ref,
          privacyStatus: 'public',
          tags: ['SignalBoost', 'AI', 'marketing'],
        })
      } catch (e: any) {
        return { ok: false, errorCode: 'errUnknown', error: e?.message || 'publish threw' }
      }

      // Honesty guard: accept ONLY a genuine post (mode ends in `_live`).
      const id = String(res?.providerPostId || '')
      const mode = String(res?.mode || '')
      const isReal = !!res?.ok && !!id && mode.endsWith('_live')
      if (!isReal) {
        const code = /requires_video|requires_media|errNoAsset/.test(mode) ? 'errNoAsset' : 'errNotConnected'
        return { ok: false, errorCode: code, error: mode || 'not published' }
      }

      const liveUrl = res.liveUrl || PLATFORM_HOME[platform]
      return { ok: true, liveUrl, externalId: id }
    },
  })
}
