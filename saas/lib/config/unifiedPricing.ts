// saas/lib/config/unifiedPricing.ts
// Single source of truth for every commercial pricing lane (Audit, Core Platform
// / website, Podcast Suite). Maps each tier to its fallback price, popularity /
// visibility flags, the Stripe price env var (audit) and the API checkout
// endpoint + payload shape. Views NEVER hardcode prices, plan keys, endpoints, or
// payloads — they read from here and call buildCheckoutRequest().
//
// Two checkout shapes exist by design and are encoded per tier:
//   • Audit            → POST /api/stripe/checkout  { priceId }      (client resolves a NEXT_PUBLIC_* price id; allowlisted server-side)
//   • Website / Podcast→ POST /api/checkout         { plan, productLine }  (server maps plan→price id from non-public env)

export type ProductLine = 'audit' | 'website' | 'podcast'

export const PRODUCT_LINES: ProductLine[] = ['audit', 'website', 'podcast']

// Email used for the Enterprise "contact sales" CTA (not a checkout).
export const SALES_EMAIL = 'sales@signalboostapp.com'

export type TierCheckout =
  | { endpoint: '/api/stripe/checkout'; kind: 'priceId'; envKey: string }
  | { endpoint: '/api/checkout'; kind: 'plan'; plan: string; productLine: 'website' | 'podcast' }

export interface UnifiedTier {
  id: string
  name: string            // proper noun, locale-independent (sourced here, not in views)
  monthlyPrice: number    // numeric, for sorting / analytics
  fallbackPrice: string   // display string, e.g. '$199'
  popular?: boolean        // badge + primary button
  hidden?: boolean         // never rendered in the public grid (e.g. audit Starter — no Stripe product)
  contactSales?: boolean   // CTA is a mailto, not a checkout (audit Enterprise)
  checkout: TierCheckout
}

export interface UnifiedLane {
  id: ProductLine
  tiers: UnifiedTier[]
}

// Static NEXT_PUBLIC references so Next inlines them into the client bundle.
// (A dynamic process.env[key] lookup resolves to undefined in the browser.)
const AUDIT_PRICE_IDS: Record<string, string> = {
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER:    process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH:     process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO:        process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE: process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE ?? '',
}

export function resolveAuditPriceId(envKey: string): string {
  return AUDIT_PRICE_IDS[envKey] ?? ''
}

export const UNIFIED_PRICING_CATALOG: Record<ProductLine, UnifiedLane> = {
  // ── Audit / Cybersecurity ($79 / $199 / $599; Starter has no Stripe product) ──
  audit: {
    id: 'audit',
    tiers: [
      { id: 'starter',    name: 'Starter',    monthlyPrice: 29,  fallbackPrice: '$29',  hidden: true,
        checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER' } },
      { id: 'growth',     name: 'Growth',     monthlyPrice: 79,  fallbackPrice: '$79',
        checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH' } },
      { id: 'pro',        name: 'Pro',        monthlyPrice: 199, fallbackPrice: '$199', popular: true,
        checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO' } },
      { id: 'enterprise', name: 'Enterprise', monthlyPrice: 599, fallbackPrice: '$599', contactSales: true,
        checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE' } },
    ],
  },

  // ── Core Platform / website ($29 / $99 / $249). Server maps launch→starter,
  //    growth→pro, command→business via STRIPE_PRICE_WEBSITE_*. ────────────────
  website: {
    id: 'website',
    tiers: [
      { id: 'launch',  name: 'Launch',  monthlyPrice: 29,  fallbackPrice: '$29',
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'launch',  productLine: 'website' } },
      { id: 'growth',  name: 'Growth',  monthlyPrice: 99,  fallbackPrice: '$99', popular: true,
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'growth',  productLine: 'website' } },
      { id: 'command', name: 'Command', monthlyPrice: 249, fallbackPrice: '$249',
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'command', productLine: 'website' } },
    ],
  },

  // ── Podcast Suite ($29 / $79 / $299). Server maps plan→STRIPE_PRICE_PODCAST_*. ─
  podcast: {
    id: 'podcast',
    tiers: [
      { id: 'indie',   name: 'Indie',   monthlyPrice: 29,  fallbackPrice: '$29',
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'indie',   productLine: 'podcast' } },
      { id: 'pro',     name: 'Pro',     monthlyPrice: 79,  fallbackPrice: '$79', popular: true,
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'pro',     productLine: 'podcast' } },
      { id: 'network', name: 'Network', monthlyPrice: 299, fallbackPrice: '$299',
        checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'network', productLine: 'podcast' } },
    ],
  },
}

// Public-facing tiers for a lane (drops hidden tiers like audit Starter).
export function publicTiers(line: ProductLine): UnifiedTier[] {
  return UNIFIED_PRICING_CATALOG[line].tiers.filter((t) => !t.hidden)
}

// Dynamically built, type-safe checkout request for a tier — no inline payloads
// in the view. `missingPrice` is true only when an audit NEXT_PUBLIC_* price id
// is unset (so the card can show the localized "not configured" notice instead of
// a dead button); website/podcast prices are resolved server-side.
export type CheckoutRequest =
  | { endpoint: '/api/stripe/checkout'; body: { priceId: string }; missingPrice: boolean }
  | { endpoint: '/api/checkout'; body: { plan: string; productLine: 'website' | 'podcast' }; missingPrice: false }

export function buildCheckoutRequest(tier: UnifiedTier): CheckoutRequest {
  if (tier.checkout.kind === 'priceId') {
    const priceId = resolveAuditPriceId(tier.checkout.envKey)
    return { endpoint: tier.checkout.endpoint, body: { priceId }, missingPrice: !priceId }
  }
  return {
    endpoint: tier.checkout.endpoint,
    body: { plan: tier.checkout.plan, productLine: tier.checkout.productLine },
    missingPrice: false,
  }
}
