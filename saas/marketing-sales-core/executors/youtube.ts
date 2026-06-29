// saas/marketing-sales-core/executors/youtube.ts
// YouTube publisher — the one real connector. The upload (OAuth + Data API) is
// implemented in build step 4; this registers the executor and the seam so the
// shell compiles and the registry is honest about capability today.
import { registerExecutor } from './registry'
import type { PublishResult } from './types'
import type { Draft, MarketingHost } from '../types'

registerExecutor({
  id: 'youtube',
  capabilities: { publish: true },
  async run(draft: Draft, host: MarketingHost): Promise<PublishResult> {
    const token = host.env('YOUTUBE_OAUTH_TOKEN')
    if (!token) return { ok: false, errorCode: 'errNotConnected', error: 'YOUTUBE_OAUTH_TOKEN missing' }
    // Real upload wired in build step 4. Until then, refuse rather than fake a publish.
    return { ok: false, errorCode: 'errNotImplemented', error: 'youtube upload pending build step 4' }
  },
})
