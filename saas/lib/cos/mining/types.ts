// saas/lib/cos/mining/types.ts
// Shared types for the COS data-mining layer + the canonical feature JSON schema.

export type EventType =
  | 'click'
  | 'deposit'
  | 'transfer'
  | 'transaction'
  | 'campaign'
  | 'provider_api'

export type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown'

/** A raw behavioral/transactional event as ingested. */
export interface RawEvent {
  id?: string
  user_id: string
  event_type: EventType
  provider?: string | null
  amount_cents?: number | null
  device_type?: DeviceType | null
  occurred_at: string // ISO 8601
  metadata?: Record<string, unknown>
}

/**
 * A mined feature. THIS is the deliverable schema:
 *   { user_id, feature_name, value, timestamp }
 * `detail` carries optional non-numeric context and is never required by consumers.
 */
export interface FeatureRecord {
  user_id: string
  feature_name: string
  value: number
  timestamp: string // ISO 8601
  detail?: Record<string, unknown>
}

export interface SegmentRecord {
  user_id: string
  segment: number
  distance: number
}

export interface AssociationRule {
  antecedent: string[]
  consequent: string[]
  support: number
  confidence: number
  lift: number
}

export interface MiningRunSummary {
  run_id: string
  job: 'daily' | 'weekly' | 'manual'
  events_scanned: number
  users_processed: number
  features_written: number
  segments_written: number
  rules_found: number
}

/**
 * JSON Schema (draft-07) for a mined feature row. Exported so the predictive layer
 * and any external consumer can validate `/features/user/{id}` payloads.
 */
export const FEATURE_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://signalboostapp.com/schemas/cos/mined-feature.json',
  title: 'COS Mined Feature',
  type: 'object',
  required: ['user_id', 'feature_name', 'value', 'timestamp'],
  additionalProperties: false,
  properties: {
    user_id: { type: 'string', format: 'uuid', description: 'Owner of the feature.' },
    feature_name: {
      type: 'string',
      description: 'Stable machine name, e.g. avg_deposit_cents, preferred_txn_hour.',
    },
    value: { type: 'number', description: 'Numeric value of the feature.' },
    timestamp: { type: 'string', format: 'date-time', description: 'When the feature was computed.' },
    detail: { type: 'object', description: 'Optional non-numeric context.', additionalProperties: true },
  },
} as const

/** Canonical machine names for the Phase-1 feature set (kept stable for model contracts). */
export const FEATURE_NAMES = {
  EVENT_FREQUENCY_PER_DAY: 'event_frequency_per_day',
  TXN_COUNT: 'transaction_count',
  AVG_DEPOSIT_CENTS: 'avg_deposit_cents',
  AVG_TRANSFER_CENTS: 'avg_transfer_cents',
  PREFERRED_TXN_HOUR: 'preferred_txn_hour',
  DOMINANT_DEVICE_CODE: 'dominant_device_code', // 0 unknown,1 mobile,2 desktop,3 tablet
  CAMPAIGN_ENGAGEMENT_RATE: 'campaign_engagement_rate',
  RECENCY_DAYS: 'recency_days',
  AMOUNT_TREND_SLOPE: 'amount_trend_slope', // regression slope of amount over time
} as const

export const DEVICE_CODE: Record<DeviceType, number> = {
  unknown: 0,
  mobile: 1,
  desktop: 2,
  tablet: 3,
}
