// saas/marketing-sales-core/executors/linkedin.ts
// linkedin publisher — registered but gated. Requires platform approval before any
// code can post. Declares publish:false so it is hidden in UI and refused
// server-side; it can never fabricate a publish.
import { registerExecutor } from './registry'
import type { PublishResult } from './types'
import type { Draft, MarketingHost } from '../types'

registerExecutor({
  id: 'linkedin',
  capabilities: { publish: false, reason: 'platform approval pending' },
  async run(_draft: Draft, _host: MarketingHost): Promise<PublishResult> {
    return { ok: false, errorCode: 'errPlatformPending', error: 'linkedin requires platform approval' }
  },
})
