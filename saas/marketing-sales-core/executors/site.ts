// saas/marketing-sales-core/executors/site.ts
// Internal "site" publisher — the first real publish path, with zero external
// dependency. An approved campaign's drafts already live in ms_drafts; publishing
// makes them public at a real URL on the host's own site. No OAuth, no asset
// upload: it returns the canonical campaign URL that the public page renders from.
import { registerExecutor } from './registry'
import type { PublishResult } from './types'
import type { Draft, MarketingHost } from '../types'

registerExecutor({
  id: 'site',
  capabilities: { publish: true },
  async run(draft: Draft, host: MarketingHost): Promise<PublishResult> {
    if (!draft || !draft.campaign_id) return { ok: false, errorCode: 'errUnknown', error: 'missing campaign_id' }
    const base = (host.env('MARKETING_SALES_BASE_URL') || 'https://saas.signalboostapp.com').replace(/\/+$/, '')
    const liveUrl = `${base}/m/${draft.campaign_id}`
    return { ok: true, liveUrl, externalId: draft.campaign_id }
  },
})
