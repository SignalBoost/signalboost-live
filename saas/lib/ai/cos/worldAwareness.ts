import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { createGdeltNewsSearch } from '@/lib/cos-core/layers/learning/mediaClients'
import { BUILTIN_OFFICIAL_TECH_FEEDS, createFeedSearch, parseFeedList } from '@/lib/cos-core/layers/learning/feedClients'
import type { LearningConnectorResult } from '@/lib/cos-core/layers/learning/connectors'

export type WorldAwarenessDesk = { id: string; query: string }
export type WorldAwarenessResult = {
  status: 'refreshed' | 'skipped' | 'error'
  desks: number
  acquired: number
  retained: number
  expiredPurged: number
  error?: string
}

// These are broad newsroom desks, not per-question factual rules. Their job is the human-like
// background habit of paying attention to what changed in the world before a question arrives.
export const WORLD_AWARENESS_DESKS: WorldAwarenessDesk[] = [
  { id: 'world', query: 'world politics government elections diplomacy conflict leadership' },
  { id: 'business', query: 'global business economy markets companies regulation leadership' },
  { id: 'technology', query: 'technology software cloud cybersecurity artificial intelligence releases' },
  { id: 'science', query: 'science health climate space research public policy' },
]

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback
}

export function worldAwarenessTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedNumber(env.COS_WORLD_AWARENESS_TTL_HOURS, 72, 1, 168) * 60 * 60 * 1000
}

export function worldAwarenessResultsPerDesk(env: NodeJS.ProcessEnv = process.env): number {
  return boundedNumber(env.COS_WORLD_AWARENESS_RESULTS_PER_DESK, 4, 1, 8)
}

export function normalizeAwarenessObservedAt(value: unknown, fallbackMs = Date.now()): string {
  const raw = String(value ?? '').trim()
  if (raw) {
    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (compact) {
      const [, y, m, d, hh, mm, ss] = compact
      const parsed = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`)
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
    }
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  return new Date(fallbackMs).toISOString()
}

function sourceHost(uri: string): string {
  try { return new URL(uri).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

export type WorldAwarenessRow = {
  content_hash: string
  source_uri: string
  source_title: string
  source_host: string
  snippet: string
  desk: string
  source_kind: string
  observed_at: string
  ingested_at: string
  expires_at: string
}

export function awarenessRow(
  desk: string,
  sourceKind: 'news_article' | 'official_documentation',
  item: LearningConnectorResult,
  nowMs = Date.now(),
  ttlMs = 72 * 60 * 60 * 1000,
): WorldAwarenessRow | null {
  const uri = String(item.uri || '').trim()
  if (!/^https?:\/\//i.test(uri)) return null
  const title = String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const snippet = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  if (!title && !snippet) return null
  const observedAt = normalizeAwarenessObservedAt(item.observedAt, nowMs)
  const observedMs = Date.parse(observedAt)
  const basis = Number.isFinite(observedMs) ? Math.max(observedMs, nowMs - ttlMs) : nowMs
  return {
    content_hash: createHash('sha256').update(`${uri}\n${title}`).digest('hex'),
    source_uri: uri,
    source_title: title,
    source_host: sourceHost(uri),
    snippet,
    desk,
    source_kind: sourceKind,
    observed_at: observedAt,
    ingested_at: new Date(nowMs).toISOString(),
    expires_at: new Date(basis + ttlMs).toISOString(),
  }
}

export async function runWorldAwareness(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorldAwarenessResult> {
  if (env.COS_WORLD_AWARENESS_ENABLED === 'false') {
    return { status: 'skipped', desks: 0, acquired: 0, retained: 0, expiredPurged: 0 }
  }
  const db = cosServiceDb()
  if (!db) {
    return { status: 'skipped', desks: 0, acquired: 0, retained: 0, expiredPurged: 0, error: 'COS Supabase service store is not configured' }
  }

  const nowMs = Date.now()
  const ttlMs = worldAwarenessTtlMs(env)
  const limit = worldAwarenessResultsPerDesk(env)
  const newsSearch = createGdeltNewsSearch()
  const officialFeeds = [
    ...BUILTIN_OFFICIAL_TECH_FEEDS,
    ...parseFeedList(env.COS_OFFICIAL_DOC_FEEDS),
    ...parseFeedList(env.COS_TECH_RSS_FEEDS),
  ]
  const feedSearch = officialFeeds.length ? createFeedSearch(officialFeeds, fetch, { fullText: false }) : null

  try {
    const newsBatches = await Promise.all(WORLD_AWARENESS_DESKS.map(async desk => {
      try { return { desk, items: await newsSearch(desk.query, limit) } }
      catch (error) {
        console.warn('[cos-world-awareness-source-error]', JSON.stringify({ source:'gdelt', desk:desk.id, error:error instanceof Error?error.message:String(error) }))
        return { desk, items: [] as LearningConnectorResult[] }
      }
    }))

    const officialItems = feedSearch
      ? await feedSearch('technology software cloud cybersecurity artificial intelligence releases', limit).catch(error => {
          console.warn('[cos-world-awareness-source-error]', JSON.stringify({ source:'official_feeds', desk:'technology', error:error instanceof Error?error.message:String(error) }))
          return [] as LearningConnectorResult[]
        })
      : []

    const rows: WorldAwarenessRow[] = []
    for (const batch of newsBatches) {
      for (const item of batch.items) {
        const row = awarenessRow(batch.desk.id, 'news_article', item, nowMs, ttlMs)
        if (row && Date.parse(row.expires_at) > nowMs) rows.push(row)
      }
    }
    for (const item of officialItems) {
      const row = awarenessRow('technology', 'official_documentation', item, nowMs, ttlMs)
      if (row && Date.parse(row.expires_at) > nowMs) rows.push(row)
    }

    let retained = 0
    if (rows.length) {
      const { error } = await db.from('cos_world_awareness').upsert(rows, { onConflict: 'content_hash' })
      if (error) throw error
      retained = rows.length
    }

    const purge = await db.from('cos_world_awareness').delete({ count: 'exact' }).lt('expires_at', new Date(nowMs).toISOString())
    if (purge.error) throw purge.error
    const expiredPurged = Number(purge.count ?? 0)
    const result: WorldAwarenessResult = {
      status: 'refreshed',
      desks: WORLD_AWARENESS_DESKS.length,
      acquired: newsBatches.reduce((sum,batch)=>sum+batch.items.length,0)+officialItems.length,
      retained,
      expiredPurged,
    }
    console.info('[cos-world-awareness]', JSON.stringify({ at:new Date(nowMs).toISOString(), ...result }))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-world-awareness-failed]', message)
    return { status:'error', desks:WORLD_AWARENESS_DESKS.length, acquired:0, retained:0, expiredPurged:0, error:message }
  }
}
