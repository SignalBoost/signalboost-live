// saas/lib/cos/predictive.ts
// Predictive layer of the COS module. Consumes mined features + association rules + the
// user's recent behavioral tokens and forecasts next actions and propensity scores.
//
// Deliberately transparent and dependency-free: predictions are derived from the mined
// Apriori rules and the feature vector, not a black-box trained model. That makes the
// module portable and auditable. Swap in a trained model later by implementing the same
// Prediction contract — consumers won't change.

import { FeatureRecord, AssociationRule, FEATURE_NAMES as F } from './mining/types'

export interface Prediction {
  action: string // the predicted next behavioral token, e.g. "transfer@fri"
  score: number // 0..1 ranking score
  confidence: number // rule confidence backing it
  basis: string // short machine reason, e.g. "rule:deposit@mon"
}

export interface PropensityScores {
  engagement: number // 0..1 — how active/engaged
  churn_risk: number // 0..1 — likelihood of going dormant
  value: number // 0..1 — relative monetary value
}

function featureMap(features: FeatureRecord[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of features) m.set(f.feature_name, f.value)
  return m
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Propensity scores from the mined feature vector. Heuristic, bounded, and explainable.
 * Tune the reference constants per business; defaults are sensible starting points.
 */
export function propensityScores(features: FeatureRecord[]): PropensityScores {
  const m = featureMap(features)
  const freq = m.get(F.EVENT_FREQUENCY_PER_DAY) ?? 0
  const recency = m.get(F.RECENCY_DAYS) ?? 999
  const engagementRate = m.get(F.CAMPAIGN_ENGAGEMENT_RATE) ?? 0
  const avgDeposit = m.get(F.AVG_DEPOSIT_CENTS) ?? 0
  const trend = m.get(F.AMOUNT_TREND_SLOPE) ?? 0

  // Engagement rises with activity + campaign interaction, decays with days idle.
  const engagement = clamp01(0.5 * clamp01(freq / 5) + 0.3 * clamp01(engagementRate * 3) + 0.2 * clamp01(1 - recency / 30))

  // Churn risk grows with idleness and falls with steady activity.
  const churn_risk = clamp01(0.7 * clamp01(recency / 30) + 0.3 * clamp01(1 - freq / 3))

  // Value blends deposit size with a positive spending trend.
  const value = clamp01(0.7 * clamp01(avgDeposit / 100000) + 0.3 * clamp01(0.5 + trend / 200000))

  return { engagement, churn_risk, value }
}

/**
 * Rank likely next actions for a user by matching their recent behavioral tokens against
 * the mined association rules. A rule fires when ALL its antecedents are in the user's
 * recent tokens; the consequent token(s) become predicted next actions, scored by
 * confidence × normalized lift.
 */
export function nextBestActions(
  recentTokens: string[],
  rules: AssociationRule[],
  topN = 5,
): Prediction[] {
  const have = new Set(recentTokens)
  const byAction = new Map<string, Prediction>()

  for (const r of rules) {
    if (r.antecedent.length === 0) continue
    if (!r.antecedent.every((a) => have.has(a))) continue
    const liftBoost = clamp01(r.lift / 3) // normalize lift into 0..1-ish
    const score = clamp01(r.confidence * (0.6 + 0.4 * liftBoost))
    for (const action of r.consequent) {
      if (have.has(action)) continue // already done it
      const prev = byAction.get(action)
      if (!prev || score > prev.score) {
        byAction.set(action, {
          action,
          score,
          confidence: r.confidence,
          basis: `rule:${r.antecedent.join('+')}`,
        })
      }
    }
  }

  return Array.from(byAction.values()).sort((a, b) => b.score - a.score).slice(0, topN)
}

/**
 * Full forecast for one user: next-best-actions + propensity. This is the function the
 * predictive endpoint and any downstream model orchestration call.
 */
export function forecastUser(
  features: FeatureRecord[],
  recentTokens: string[],
  rules: AssociationRule[],
  topN = 5,
): { predictions: Prediction[]; propensity: PropensityScores } {
  return {
    predictions: nextBestActions(recentTokens, rules, topN),
    propensity: propensityScores(features),
  }
}

/**
 * Derive a user's recent behavioral tokens from raw-ish event rows (the same token shape
 * the miner uses for Apriori), so the predictor can run against live recent activity.
 */
export function recentTokensFromEvents(
  events: Array<{ event_type: string; device_type?: string | null; occurred_at: string }>,
): string[] {
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const TXN = new Set(['deposit', 'transfer', 'transaction'])
  const tokens = new Set<string>()
  let device = 'unknown'
  for (const e of events) {
    const d = new Date(e.occurred_at)
    if (TXN.has(e.event_type) && !isNaN(d.getTime())) tokens.add(`${e.event_type}@${DOW[d.getDay()]}`)
    if (e.event_type === 'campaign') tokens.add('campaign')
    if (e.device_type) device = e.device_type
  }
  tokens.add(`device:${device}`)
  return Array.from(tokens)
}
