// saas/lib/cos/mining/features.ts
// Transform stage: raw events -> mined features, clustering vectors, and Apriori baskets.

import {
  RawEvent,
  FeatureRecord,
  DeviceType,
  DEVICE_CODE,
  FEATURE_NAMES as F,
} from './types'
import { linearRegression } from './algorithms'

const DAY_MS = 86_400_000

function byUser(events: RawEvent[]): Map<string, RawEvent[]> {
  const m = new Map<string, RawEvent[]>()
  for (const e of events) {
    if (!e.user_id) continue
    const arr = m.get(e.user_id) || []
    arr.push(e)
    m.set(e.user_id, arr)
  }
  return m
}

function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  let best: T | undefined
  let bestC = 0
  for (const v of values) {
    const c = (counts.get(v) || 0) + 1
    counts.set(v, c)
    if (c > bestC) { bestC = c; best = v }
  }
  return best
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

const TXN_TYPES = new Set(['deposit', 'transfer', 'transaction'])

export interface ExtractResult {
  features: FeatureRecord[]
  /** One standardized vector per user, aligned with `userOrder`, for K-means. */
  vectors: number[][]
  userOrder: string[]
  /** Per-user "baskets" of day-tagged action labels for Apriori. */
  baskets: string[][]
}

/**
 * Compute the Phase-1 feature set for every user present in `events`.
 * `now` is injectable for deterministic tests.
 */
export function extractFeatures(events: RawEvent[], now = Date.now()): ExtractResult {
  const grouped = byUser(events)
  const features: FeatureRecord[] = []
  const ts = new Date(now).toISOString()
  const userOrder: string[] = []
  const rawVectors: number[][] = []
  const baskets: string[][] = []

  for (const [userId, evs] of grouped) {
    const times = evs.map((e) => new Date(e.occurred_at).getTime()).filter((t) => !isNaN(t))
    const spanDays = times.length > 1 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY_MS) : 1
    const freqPerDay = evs.length / spanDays

    const txns = evs.filter((e) => TXN_TYPES.has(e.event_type))
    const deposits = evs.filter((e) => e.event_type === 'deposit' && typeof e.amount_cents === 'number')
    const transfers = evs.filter((e) => e.event_type === 'transfer' && typeof e.amount_cents === 'number')

    const avgDeposit = mean(deposits.map((e) => e.amount_cents as number))
    const avgTransfer = mean(transfers.map((e) => e.amount_cents as number))

    const hours = txns.map((e) => new Date(e.occurred_at).getHours()).filter((h) => !isNaN(h))
    const preferredHour = hours.length ? (mode(hours) as number) : 0

    const device = (mode(evs.map((e) => (e.device_type || 'unknown') as DeviceType)) || 'unknown') as DeviceType
    const deviceCode = DEVICE_CODE[device] ?? 0

    const campaignEvents = evs.filter((e) => e.event_type === 'campaign').length
    const engagementRate = evs.length ? campaignEvents / evs.length : 0

    const recencyDays = times.length ? Math.max(0, (now - Math.max(...times)) / DAY_MS) : 0

    // Amount-over-time trend (slope of cents vs day index)
    const amountPoints = txns
      .filter((e) => typeof e.amount_cents === 'number')
      .map((e) => ({ x: new Date(e.occurred_at).getTime() / DAY_MS, y: e.amount_cents as number }))
    const trend = linearRegression(amountPoints)

    const push = (name: string, value: number, detail?: Record<string, unknown>) =>
      features.push({ user_id: userId, feature_name: name, value: Number.isFinite(value) ? value : 0, timestamp: ts, detail })

    push(F.EVENT_FREQUENCY_PER_DAY, freqPerDay)
    push(F.TXN_COUNT, txns.length)
    push(F.AVG_DEPOSIT_CENTS, avgDeposit)
    push(F.AVG_TRANSFER_CENTS, avgTransfer)
    push(F.PREFERRED_TXN_HOUR, preferredHour)
    push(F.DOMINANT_DEVICE_CODE, deviceCode, { device })
    push(F.CAMPAIGN_ENGAGEMENT_RATE, engagementRate)
    push(F.RECENCY_DAYS, recencyDays)
    push(F.AMOUNT_TREND_SLOPE, trend.slope, { r2: trend.r2, n: trend.n })

    // Clustering vector (raw; standardized below)
    userOrder.push(userId)
    rawVectors.push([
      freqPerDay,
      txns.length,
      avgDeposit,
      avgTransfer,
      preferredHour,
      deviceCode,
      engagementRate,
      recencyDays,
    ])

    // Apriori basket: behavioral tokens for this user (e.g. "deposit@mon", "transfer@fri", "device:mobile")
    const tokens = new Set<string>()
    for (const e of evs) {
      const d = new Date(e.occurred_at)
      if (TXN_TYPES.has(e.event_type) && !isNaN(d.getTime())) {
        tokens.add(`${e.event_type}@${DOW[d.getDay()]}`)
      }
      if (e.event_type === 'campaign') tokens.add('campaign')
    }
    tokens.add(`device:${device}`)
    baskets.push(Array.from(tokens))
  }

  const vectors = standardize(rawVectors)
  return { features, vectors, userOrder, baskets }
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Column-wise z-score standardization so K-means isn't dominated by cents-scale features. */
export function standardize(rows: number[][]): number[][] {
  if (rows.length === 0) return []
  const dim = rows[0].length
  const means = new Array(dim).fill(0)
  const stds = new Array(dim).fill(0)
  for (const r of rows) for (let d = 0; d < dim; d++) means[d] += r[d]
  for (let d = 0; d < dim; d++) means[d] /= rows.length
  for (const r of rows) for (let d = 0; d < dim; d++) stds[d] += (r[d] - means[d]) ** 2
  for (let d = 0; d < dim; d++) stds[d] = Math.sqrt(stds[d] / rows.length) || 1
  return rows.map((r) => r.map((v, d) => (v - means[d]) / stds[d]))
}
