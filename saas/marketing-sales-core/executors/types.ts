// saas/marketing-sales-core/executors/types.ts
// Publisher contract. A publisher (YouTube, TikTok, LinkedIn, …) self-registers.
// Honest by construction: a campaign reaches 'published' only when run() returns
// a real liveUrl; gated platforms declare publish:false and are refused.
import type { Draft, MarketingHost } from '../types'

export interface PublishResult {
  ok: boolean
  liveUrl?: string
  externalId?: string
  errorCode?: string   // dictionary key — the UI localizes it via msError(); never shown raw
  error?: string       // optional developer/log detail only; NEVER shown to a user
}

export interface PublishExecutor {
  id: string                                   // 'youtube' | 'tiktok' | 'linkedin' | …
  capabilities: { publish: boolean; reason?: string }
  run(draft: Draft, host: MarketingHost): Promise<PublishResult>
}

// Action ids that exist but are not finished. Mirrors the console-core
// INCOMPLETE_ACTION_IDS convention: hidden in UI, refused server-side.
export const INCOMPLETE_ACTION_IDS: ReadonlyArray<string> = ['tiktok.publish', 'linkedin.publish']
