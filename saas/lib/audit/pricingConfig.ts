// saas/lib/audit/pricingConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// Isolated pricing constants for the Audit Project expansion.
// These are COMPLETELY SEPARATE from the core SaaS plans
// (Free Demo / Launch / Growth / Command) and their credit structures.
//
// Stripe price IDs are intentionally left as empty strings so the owner
// can fill them in once the products are created in the Stripe dashboard.
// Wire them via env vars (AUDIT_STRIPE_PRICE_STARTER, etc.) or replace
// the empty strings directly before going live.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditTierKey = 'audit_starter' | 'audit_growth' | 'audit_pro' | 'audit_enterprise'

export type AuditTier = {
  key: AuditTierKey
  /** Monthly price in USD cents (e.g. 2900 = $29.00) */
  priceCents: number
  /** Display price string */
  priceDisplay: string
  /** Number of audits included per billing period, or 'unlimited' */
  audits: number | 'unlimited'
  /** Stripe price ID — populate before going live */
  stripePriceId: string
  /** Whether this tier is highlighted as the recommended choice */
  popular: boolean
}

export const AUDIT_TIERS: AuditTier[] = [
  {
    key: 'audit_starter',
    priceCents: 2900,
    priceDisplay: '$29',
    audits: 3,
    stripePriceId: process.env.AUDIT_STRIPE_PRICE_STARTER || '',
    popular: false,
  },
  {
    key: 'audit_growth',
    priceCents: 7900,
    priceDisplay: '$79',
    audits: 20,
    stripePriceId: process.env.AUDIT_STRIPE_PRICE_GROWTH || '',
    popular: true,
  },
  {
    key: 'audit_pro',
    priceCents: 19900,
    priceDisplay: '$199',
    audits: 100,
    stripePriceId: process.env.AUDIT_STRIPE_PRICE_PRO || '',
    popular: false,
  },
  {
    key: 'audit_enterprise',
    priceCents: 59900,
    priceDisplay: '$599',
    audits: 'unlimited',
    stripePriceId: process.env.AUDIT_STRIPE_PRICE_ENTERPRISE || '',
    popular: false,
  },
]

/** Lookup map for O(1) access by key */
export const AUDIT_TIER_MAP: Record<AuditTierKey, AuditTier> = Object.fromEntries(
  AUDIT_TIERS.map(t => [t.key, t]),
) as Record<AuditTierKey, AuditTier>

/** Ordered list of tier keys (cheapest → most expensive) */
export const AUDIT_TIER_ORDER: AuditTierKey[] = [
  'audit_starter',
  'audit_growth',
  'audit_pro',
  'audit_enterprise',
]
