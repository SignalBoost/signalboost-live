// saas/lib/builder/liveJob.ts
//
// THE LIVE BUILDER JOB PANEL'S SIGNAL. The owner Assistant shows a running background job beside the conversation
// (AssistantTransportBoundary) and polls its status every few seconds. Any client that starts a background job hands
// it to that panel through this one event and storage key, so a long job never holds a chat turn open.
//
// Browser-only; safe to import from server modules because nothing runs at import time.

export const LIVE_BUILDER_KEY = 'cos-builder-live-conversation-job-v1'
export const LIVE_BUILDER_EVENT = 'cos-builder-live-job'

export type LiveBuilder = { jobId: string; conversationId: string; status: string; reply: string }

export function announceLiveBuilder(job: LiveBuilder): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(LIVE_BUILDER_KEY, JSON.stringify(job)) } catch { /* storage optional */ }
  window.dispatchEvent(new CustomEvent<LiveBuilder>(LIVE_BUILDER_EVENT, { detail: job }))
}
