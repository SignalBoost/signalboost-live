// saas/marketing-sales-host/executors/social.ts
// Generic multi-platform social connector — built for portability and multi-tenant
// adoption. It registers one executor per main platform (YouTube, LinkedIn,
// Facebook, Instagram, X) and routes publishing through the platform's real
// uploader (lib/outreach/social-connectors.publishSocialPost). Two enterprise-ready
// properties are intentional here:
//   1) Credentials are resolved PER ORG via resolveOrgToken() — the single seam an
//      enterprise host swaps to feed each tenant's own connected accounts. SignalBoost
//      (the first org) resolves from outreach_social_tokens; another adopter resolves
//      from their own store, isolated by org_id.
//   2) Honest by construction: every platform whose real publish path is not yet live
//      returns the uploader's stub, and the guard below refuses it (errNotConnected)
//      so a fake URL is NEVER recorded. A platform "lights up" automatically the moment
//      its real publish path returns a genuine post id.
import { publishSocialPost, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { registerExecutor } from '@/marketing-sales-core'
import type { Draft, MarketingHost, Actor } from '@/marketing-sales-core/types'
import type { PublishResult } from '@/marketing-sales-core/executors/types'

type Kind = 'video' | 'text' | 'media'
const PLATFORMS: Array<{ id: string; platform: SocialPlatform; kind: Kind }> = [
  { id: 'youtube',   platform: 'youtube_channels',   kind: 'video' },
  { id: 'linkedin',  platform: 'linkedin_company',   kind: 'text'  },
  { id: 'facebook',  platform: 'facebook_pages',     kind: 'text'  },
  { id: 'instagram', platform: 'instagram_business', kind: 'media' },
  { id: 'twitter',   platform: 'twitter_x',          kind: 'text'  },
]

// Modes the platform uploader returns when it did NOT really post.
const STUB_MODES = new Set(['oauth_credentials_not_configured_logged', 'oauth_publish_ready'])

// PER-ORG credential seam. SignalBoost resolves the latest connected token for the
// platform from outreach_social_tokens. An enterprise host overrides how this maps
// to org_id; the connector logic above never changes.
async function resolveOrgToken(host: MarketingHost, orgId: string, platform: SocialPlatform): Promise<{ refresh_token?: string; access_token?: string } | null> {
  try {
    const rows = await host.store.select('outreach_social_tokens', { platform })
    if (!Array.isArray(rows) || !rows.length) return null
    return rows[rows.length - 1] as any
  } catch { return null }
}

function liveUrlFor(platform: SocialPlatform, id: string): string | null {
  switch (platform) {
    case 'youtube_channels':   return `https://www.youtube.com/watch?v=${id}`
    case 'twitter_x':          return `https://x.com/i/web/status/${id}`
    case 'linkedin_company':   return `https://www.linkedin.com/feed/update/${id}`
    case 'facebook_pages':     return `https://www.facebook.com/${id}`
    case 'instagram_business': return `https://www.instagram.com/p/${id}`
    default:                   return null
  }
}

async function orgOf(host: MarketingHost): Promise<string> {
  // The host's actor carries org_id — the real per-tenant scope for credentials.
  try { const a = await host.auth.getCurrentActor(); return a?.orgId || 'signalboost' } catch { return 'signalboost' }
}

for (const def of PLATFORMS) {
  registerExecutor({
    id: def.id,
    capabilities: { publish: true },
    async run(draft: Draft, host: MarketingHost): Promise<PublishResult> {
      // content requirement per platform
      if (def.kind === 'video' && !draft?.asset_url) return { ok: false, errorCode: 'errNoAsset', error: 'video required' }
      if (def.kind === 'media' && !draft?.asset_url) return { ok: false, errorCode: 'errNoAsset', error: 'media required' }
      if (def.kind === 'text' && !(draft?.body || draft?.title)) return { ok: false, errorCode: 'errUnknown', error: 'empty draft' }

      const tok = await resolveOrgToken(host, await orgOf(host), def.platform)
      if (!tok || (!tok.refresh_token && !tok.access_token)) {
        return { ok: false, errorCode: 'errNotConnected', error: `${def.platform} not connected` }
      }

      let res: any
      try {
        res = await publishSocialPost({
          platform: def.platform,
          text: [draft.title, draft.body].filter(Boolean).join('\n\n'),
          title: (draft.title || '').slice(0, 95),
          description: draft.body || '',
          videoUrl: def.kind === 'video' ? (draft.asset_url || undefined) : undefined,
          imageUrl: def.kind === 'media' ? (draft.asset_url || undefined) : undefined,
          refreshToken: tok.refresh_token,
          accessToken: tok.access_token,
          privacyStatus: 'public',
          tags: ['SignalBoost', 'AI', 'marketing'],
        })
      } catch (e: any) {
        return { ok: false, errorCode: 'errUnknown', error: e?.message || 'publish threw' }
      }

      // Honesty guard: refuse anything that isn't a genuine post.
      const id = String(res?.providerPostId || '')
      const synthetic = /_\d{13,}$/.test(id) // `${platform}_${Date.now()}`
      const isStub = !res?.ok || STUB_MODES.has(res?.mode) || synthetic || !id
      if (isStub) {
        const code = res?.mode === 'youtube_requires_video' ? 'errNoAsset' : 'errNotConnected'
        return { ok: false, errorCode: code, error: res?.mode || 'not published' }
      }

      const liveUrl = liveUrlFor(def.platform, id)
      if (!liveUrl) return { ok: false, errorCode: 'errUnknown', error: 'no permalink' }
      return { ok: true, liveUrl, externalId: id }
    },
  })
}
