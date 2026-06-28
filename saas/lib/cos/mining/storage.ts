// saas/lib/cos/mining/storage.ts
// The only place the mining layer talks to storage. A MiningStore interface lets the
// raw lake + feature store be backed by Supabase (live, in-stack) today and swapped to
// Azure Data Lake (raw events) + Cosmos DB (features) later WITHOUT touching the pipeline.
//
// Backend is chosen by COS_MINING_BACKEND ('supabase' default | 'azure'). All credentials
// come from env / Key Vault — never hard-coded, never persisted by this module.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { RawEvent, FeatureRecord, SegmentRecord, AssociationRule } from './types'

export interface MiningRunRow {
  id: string
  job: string
  status: string
  events_scanned: number
  users_processed: number
  features_written: number
  segments_written: number
  rules_found: number
  error: string | null
  started_at: string
  finished_at: string | null
}

export interface SegmentCount {
  segment: number
  count: number
}

export interface MiningStore {
  appendEvents(events: RawEvent[]): Promise<{ ok: boolean; inserted: number; error?: string }>
  loadEvents(sinceISO: string, limit: number): Promise<RawEvent[]>
  loadUserEvents(userId: string, sinceISO: string, limit: number): Promise<RawEvent[]>
  startRun(job: string, actor: string): Promise<string>
  finishRun(runId: string, patch: Record<string, unknown>): Promise<void>
  writeFeatures(features: FeatureRecord[], runId: string): Promise<number>
  writeSegments(segments: SegmentRecord[], runId: string): Promise<number>
  writeRules(rules: AssociationRule[], runId: string): Promise<number>
  getUserFeatures(userId: string): Promise<FeatureRecord[]>
  getUserSegment(userId: string): Promise<SegmentRecord | null>
  // Aggregate reads for the admin dashboard:
  getRecentRuns(n: number): Promise<MiningRunRow[]>
  getSegmentDistribution(): Promise<SegmentCount[]>
  getTopRules(n: number): Promise<AssociationRule[]>
}

// ── Supabase admin client (service role; server-only; bypasses RLS) ──────────
let cached: SupabaseClient | null = null
function admin(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cached
}

class SupabaseMiningStore implements MiningStore {
  async appendEvents(events: RawEvent[]) {
    const db = admin()
    if (!db) return { ok: false, inserted: 0, error: 'Supabase service role not configured' }
    if (events.length === 0) return { ok: true, inserted: 0 }
    const rows = events.map((e) => ({
      user_id: e.user_id,
      event_type: e.event_type,
      provider: e.provider ?? null,
      amount_cents: typeof e.amount_cents === 'number' ? e.amount_cents : null,
      device_type: e.device_type ?? null,
      occurred_at: e.occurred_at,
      metadata: e.metadata ?? {},
    }))
    const { error } = await db.from('cos_events').insert(rows)
    if (error) return { ok: false, inserted: 0, error: error.message }
    return { ok: true, inserted: rows.length }
  }

  async loadEvents(sinceISO: string, limit: number) {
    const db = admin()
    if (!db) return []
    const { data, error } = await db
      .from('cos_events')
      .select('user_id,event_type,provider,amount_cents,device_type,occurred_at,metadata')
      .gte('occurred_at', sinceISO)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data as RawEvent[]
  }

  async loadUserEvents(userId: string, sinceISO: string, limit: number) {
    const db = admin()
    if (!db) return []
    const { data, error } = await db
      .from('cos_events')
      .select('user_id,event_type,provider,amount_cents,device_type,occurred_at,metadata')
      .eq('user_id', userId)
      .gte('occurred_at', sinceISO)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data as RawEvent[]
  }

  async startRun(job: string, actor: string) {
    const db = admin()
    if (!db) return ''
    const { data } = await db
      .from('cos_mining_runs')
      .insert({ job, actor, status: 'running' })
      .select('id')
      .single()
    return data?.id || ''
  }

  async finishRun(runId: string, patch: Record<string, unknown>) {
    const db = admin()
    if (!db || !runId) return
    await db.from('cos_mining_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', runId)
  }

  async writeFeatures(features: FeatureRecord[], runId: string) {
    const db = admin()
    if (!db || features.length === 0) return 0
    const rows = features.map((f) => ({
      user_id: f.user_id,
      feature_name: f.feature_name,
      value: f.value,
      ts: f.timestamp,
      run_id: runId || null,
      detail: f.detail ?? {},
    }))
    const { error } = await db.from('cos_user_features').upsert(rows, { onConflict: 'user_id,feature_name' })
    return error ? 0 : rows.length
  }

  async writeSegments(segments: SegmentRecord[], runId: string) {
    const db = admin()
    if (!db || segments.length === 0) return 0
    const rows = segments.map((s) => ({
      user_id: s.user_id,
      segment: s.segment,
      distance: s.distance,
      run_id: runId || null,
      computed_at: new Date().toISOString(),
    }))
    const { error } = await db.from('cos_segments').upsert(rows, { onConflict: 'user_id' })
    return error ? 0 : rows.length
  }

  async writeRules(rules: AssociationRule[], runId: string) {
    const db = admin()
    if (!db || rules.length === 0) return 0
    await db.from('cos_rules').delete().not('id', 'is', null)
    const rows = rules.map((r) => ({
      antecedent: r.antecedent,
      consequent: r.consequent,
      support: r.support,
      confidence: r.confidence,
      lift: r.lift,
      run_id: runId || null,
    }))
    const { error } = await db.from('cos_rules').insert(rows)
    return error ? 0 : rows.length
  }

  async getUserFeatures(userId: string) {
    const db = admin()
    if (!db) return []
    const { data } = await db
      .from('cos_user_features')
      .select('user_id,feature_name,value,ts,detail')
      .eq('user_id', userId)
    if (!data) return []
    return data.map((d: any) => ({
      user_id: d.user_id,
      feature_name: d.feature_name,
      value: d.value,
      timestamp: d.ts,
      detail: d.detail || {},
    })) as FeatureRecord[]
  }

  async getUserSegment(userId: string) {
    const db = admin()
    if (!db) return null
    const { data } = await db.from('cos_segments').select('user_id,segment,distance').eq('user_id', userId).single()
    if (!data) return null
    return { user_id: data.user_id, segment: data.segment, distance: data.distance } as SegmentRecord
  }

  async getRecentRuns(n: number) {
    const db = admin()
    if (!db) return []
    const { data } = await db
      .from('cos_mining_runs')
      .select('id,job,status,events_scanned,users_processed,features_written,segments_written,rules_found,error,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(n)
    return (data || []) as MiningRunRow[]
  }

  async getSegmentDistribution() {
    const db = admin()
    if (!db) return []
    const { data } = await db.from('cos_segments').select('segment')
    if (!data) return []
    const counts = new Map<number, number>()
    for (const r of data as any[]) counts.set(r.segment, (counts.get(r.segment) || 0) + 1)
    return Array.from(counts.entries())
      .map(([segment, count]) => ({ segment, count }))
      .sort((a, b) => a.segment - b.segment)
  }

  async getTopRules(n: number) {
    const db = admin()
    if (!db) return []
    const { data } = await db
      .from('cos_rules')
      .select('antecedent,consequent,support,confidence,lift')
      .order('confidence', { ascending: false })
      .order('lift', { ascending: false })
      .limit(n)
    return (data || []) as AssociationRule[]
  }
}

// ── Azure adapter (Data Lake for raw events, Cosmos DB for features) ─────────
// Implements the SAME interface. Not active until COS_MINING_BACKEND=azure AND the Azure
// SDK + connection envs (sourced from Key Vault) are present.
class AzureMiningStore implements MiningStore {
  private fail(): never {
    throw new Error(
      'Azure mining backend not wired. Set COS_MINING_BACKEND=supabase, or implement ' +
        'AzureMiningStore with @azure/storage-file-datalake (raw events) and @azure/cosmos ' +
        '(features), pulling credentials from Key Vault. Interface is identical to Supabase.',
    )
  }
  appendEvents(): Promise<{ ok: boolean; inserted: number; error?: string }> { this.fail() }
  loadEvents(): Promise<RawEvent[]> { this.fail() }
  loadUserEvents(): Promise<RawEvent[]> { this.fail() }
  startRun(): Promise<string> { this.fail() }
  finishRun(): Promise<void> { this.fail() }
  writeFeatures(): Promise<number> { this.fail() }
  writeSegments(): Promise<number> { this.fail() }
  writeRules(): Promise<number> { this.fail() }
  getUserFeatures(): Promise<FeatureRecord[]> { this.fail() }
  getUserSegment(): Promise<SegmentRecord | null> { this.fail() }
  getRecentRuns(): Promise<MiningRunRow[]> { this.fail() }
  getSegmentDistribution(): Promise<SegmentCount[]> { this.fail() }
  getTopRules(): Promise<AssociationRule[]> { this.fail() }
}

let store: MiningStore | null = null
export function getMiningStore(): MiningStore {
  if (store) return store
  store = (process.env.COS_MINING_BACKEND || 'supabase') === 'azure' ? new AzureMiningStore() : new SupabaseMiningStore()
  return store
}
