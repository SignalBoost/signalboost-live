// saas/lib/cos/campaign-queue/store.ts
// Injected data seam for the COS campaign queue (cos_campaign_queue).
// Queue logic and pipeline workers talk to THIS port, never to Supabase directly,
// so a buyer swaps the adapter for their datastore without touching queue behavior.
// On SignalBoost's own deployment, createSupabaseCampaignQueueStore() is the adapter
// and behavior is identical to the previous direct .from('cos_campaign_queue') calls.

export interface CampaignQueueRow {
  id: string
  status?: string
  channel?: string
  metadata?: Record<string, any> | null
  approved_at?: string | null
  approved_by?: string | null
  [key: string]: any
}

export interface CampaignQueueStore {
  // Full row by id, or null if it does not exist.
  getById(id: string): Promise<CampaignQueueRow | null>
  // Just the metadata jsonb for a row — the hot re-read pipeline stages do between updates.
  getMetadata(id: string): Promise<Record<string, any> | null>
  // Apply a partial column update to one row. Returns ok:false with the error message on
  // failure instead of throwing, so callers choose whether a failed write is fatal.
  update(id: string, patch: Partial<CampaignQueueRow>): Promise<{ ok: boolean; error?: string }>
}

// ── SignalBoost's own adapter (the host implementation) ──
// Pass an existing client (e.g. publish-core's injected `admin`) to reuse it; omit it
// to use the platform admin client. A buyer replaces THIS factory, nothing above it.
import { getAdminSupabase } from '@/utils/supabase/server'

export function createSupabaseCampaignQueueStore(client?: any): CampaignQueueStore {
  const db = client || getAdminSupabase()
  return {
    async getById(id: string): Promise<CampaignQueueRow | null> {
      const { data, error } = await db.from('cos_campaign_queue').select('*').eq('id', id).single()
      if (error || !data) return null
      return data as CampaignQueueRow
    },
    async getMetadata(id: string): Promise<Record<string, any> | null> {
      const { data } = await db.from('cos_campaign_queue').select('metadata').eq('id', id).single()
      return (data?.metadata as Record<string, any>) || null
    },
    async update(id: string, patch: Partial<CampaignQueueRow>): Promise<{ ok: boolean; error?: string }> {
      const { error } = await db.from('cos_campaign_queue').update(patch).eq('id', id)
      return error ? { ok: false, error: error.message } : { ok: true }
    },
  }
}
