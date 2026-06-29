// saas/marketing-sales-host/executors/youtube.ts
// Real YouTube publisher for SignalBoost. It does NOT reimplement upload — it
// wires the department's publish seam into the platform's existing, working
// uploader (lib/outreach/social-connectors: OAuth refresh + resumable upload)
// and the stored channel token in outreach_social_tokens. Registering this id
// overwrites the portable core stub. Honest by construction: it refuses when
// there's no video asset and when the channel isn't really connected — and it
// detects the uploader's "no credentials" stub so a fake URL is never reported.
import { publishSocialPost } from '@/lib/outreach/social-connectors'
import { registerExecutor } from '@/marketing-sales-core'
import type { Draft, MarketingHost } from '@/marketing-sales-core/types'

registerExecutor({
  id: 'youtube',
  capabilities: { publish: true },
  async run(draft: Draft, host: MarketingHost) {
    // 1) needs a real rendered video on the draft
    if (!draft || !draft.asset_url) {
      return { ok: false, errorCode: 'errNoAsset', error: 'draft has no video asset_url' }
    }

    // 2) needs a connected channel (refresh token stored by the OAuth callback)
    let tok: any = null
    try {
      const rows = await host.store.select('outreach_social_tokens', { platform: 'youtube_channels' })
      tok = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null
    } catch { tok = null }
    if (!tok || !tok.refresh_token) {
      return { ok: false, errorCode: 'errNotConnected', error: 'youtube channel not connected' }
    }

    // 3) real upload via the existing platform uploader
    let res: any
    try {
      res = await publishSocialPost({
        platform: 'youtube_channels',
        text: draft.title || '',
        title: (draft.title || '').slice(0, 95),
        description: draft.body || '',
        videoUrl: draft.asset_url,
        refreshToken: tok.refresh_token,
        privacyStatus: 'public',
        tags: ['SignalBoost', 'AI', 'marketing'],
      })
    } catch (e: any) {
      return { ok: false, errorCode: 'errUnknown', error: e?.message || 'youtube upload threw' }
    }

    // 4) honesty guard: never treat the uploader's no-creds stub as a real publish
    const stub = !res?.ok
      || res?.mode === 'oauth_credentials_not_configured_logged'
      || !res?.providerPostId
      || String(res.providerPostId).startsWith('youtube_channels_')
    if (stub) {
      const code = res?.mode === 'youtube_requires_video' ? 'errNoAsset' : 'errNotConnected'
      return { ok: false, errorCode: code, error: res?.mode || 'youtube publish did not complete' }
    }

    const videoId = String(res.providerPostId)
    return { ok: true, liveUrl: `https://www.youtube.com/watch?v=${videoId}`, externalId: videoId }
  },
})
