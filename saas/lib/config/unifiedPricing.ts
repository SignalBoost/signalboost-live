// saas/lib/config/unifiedPricing.ts
//
// ARCHITECTURAL SINGLE SOURCE OF TRUTH for every commercial pricing lane.
// All three product lines live here as separate, distinct entries inside one
// catalog. Views and routes NEVER hardcode prices, plan keys, env var names,
// endpoints, or payloads — they read from here.
//
// The mandated core of every tier is { id, price, envVar }. The extra fields
// (name, fallbackPrice, popular/hidden/contactSales, checkout) are what the
// storefront cards and the checkout dispatcher require to render and transact;
// they are sourced here so views stay data-free.
//
// Two checkout shapes exist by design and are encoded per tier:
//   • Audit             → POST /api/stripe/checkout { priceId }
//       client resolves a NEXT_PUBLIC_* price id (inlined into the browser
//       bundle); the id is allowlisted server-side.
//   • Platform / Podcast → POST /api/checkout { plan, productLine }
//       the server maps plan → price id from a NON-public env var. The price id
//       is never shipped to the browser, so these envVars are intentionally not
//       NEXT_PUBLIC_*.

export type ProductLine = 'audit' | 'platform' | 'podcast'

export const PRODUCT_LINES: ProductLine[] = ['audit', 'platform', 'podcast']

// Email used for the Enterprise "contact sales" CTA (not a checkout).
export const SALES_EMAIL = 'sales@signalboostapp.com'

export type TierCheckout =
  | { endpoint: '/api/stripe/checkout'; kind: 'priceId'; envKey: string }
  | { endpoint: '/api/checkout'; kind: 'plan'; plan: string; productLine: 'platform' | 'podcast' }

export interface UnifiedTier {
  id: string
  name: string            // proper noun, locale-independent
  price: number           // monthly USD — mandated numeric field
  monthlyPrice: number    // alias of `price`, kept for legacy consumers
  fallbackPrice: string   // display string, e.g. '$199'
  envVar: string          // the Stripe price env var NAME — single source for plumbing
  popular?: boolean        // badge + primary button
  hidden?: boolean         // never rendered in the public grid (e.g. audit Starter)
  contactSales?: boolean   // CTA is a mailto, not a checkout (audit Enterprise)
  checkout: TierCheckout
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

export const UNIFIED_PRICING_CATALOG: Record<ProductLine, UnifiedTier[]> = {
  // ── LINE 1: SIGNALBOOST AUDIT & CYBERSECURITY ───────────────────────────────
  //    $79 / $199 / $599. Starter is hidden (no Stripe product). Client-side
  //    checkout via NEXT_PUBLIC_* price ids.
  audit: [
    { id: 'starter',    name: 'Starter',    price: 29,  monthlyPrice: 29,  fallbackPrice: '$29',  hidden: true,
      envVar: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER',
      checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER' } },
    { id: 'growth',     name: 'Growth',     price: 79,  monthlyPrice: 79,  fallbackPrice: '$79',
      envVar: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH',
      checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH' } },
    { id: 'pro',        name: 'Pro',        price: 199, monthlyPrice: 199, fallbackPrice: '$199', popular: true,
      envVar: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO',
      checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO' } },
    { id: 'enterprise', name: 'Enterprise', price: 599, monthlyPrice: 599, fallbackPrice: '$599', contactSales: true,
      envVar: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE',
      checkout: { endpoint: '/api/stripe/checkout', kind: 'priceId', envKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE' } },
  ],

  // ── LINE 2: CORE SAAS PLATFORM (website builder) ────────────────────────────
  //    $29 / $99 / $249. Server-side checkout; plan → price id resolved from
  //    STRIPE_PRICE_WEBSITE_LAUNCH/GROWTH/COMMAND (names synced to Stripe).
  platform: [
    { id: 'launch',  name: 'Launch',  price: 29,  monthlyPrice: 29,  fallbackPrice: '$29',
      envVar: 'STRIPE_PRICE_WEBSITE_LAUNCH',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'launch',  productLine: 'platform' } },
    { id: 'growth',  name: 'Growth',  price: 99,  monthlyPrice: 99,  fallbackPrice: '$99', popular: true,
      envVar: 'STRIPE_PRICE_WEBSITE_GROWTH',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'growth',  productLine: 'platform' } },
    { id: 'command', name: 'Command', price: 249, monthlyPrice: 249, fallbackPrice: '$249',
      envVar: 'STRIPE_PRICE_WEBSITE_COMMAND',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'command', productLine: 'platform' } },
  ],

  // ── LINE 3: PODCASTING SUITE ────────────────────────────────────────────────
  //    $29 / $79 / $299. Server-side checkout; plan → price id resolved from
  //    STRIPE_PRICE_PODCAST_* (server-only, matching the live routes).
  podcast: [
    { id: 'indie',   name: 'Indie',   price: 29,  monthlyPrice: 29,  fallbackPrice: '$29',
      envVar: 'STRIPE_PRICE_PODCAST_INDIE',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'indie',   productLine: 'podcast' } },
    { id: 'pro',     name: 'Pro',     price: 79,  monthlyPrice: 79,  fallbackPrice: '$79', popular: true,
      envVar: 'STRIPE_PRICE_PODCAST_PRO',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'pro',     productLine: 'podcast' } },
    { id: 'network', name: 'Network', price: 299, monthlyPrice: 299, fallbackPrice: '$299',
      envVar: 'STRIPE_PRICE_PODCAST_NETWORK',
      checkout: { endpoint: '/api/checkout', kind: 'plan', plan: 'network', productLine: 'podcast' } },
  ],
}

// Public-facing tiers for a lane (drops hidden tiers like audit Starter).
export function publicTiers(line: ProductLine): UnifiedTier[] {
  return UNIFIED_PRICING_CATALOG[line].filter((t) => !t.hidden)
}

// Look up a single tier by line + id (handy for routes / analytics).
export function getTier(line: ProductLine, id: string): UnifiedTier | undefined {
  return UNIFIED_PRICING_CATALOG[line].find((t) => t.id === id)
}

// Dynamically built, type-safe checkout request for a tier — no inline payloads
// in the view. `missingPrice` is true only when an audit NEXT_PUBLIC_* price id
// is unset (so the card can show a localized "not configured" notice instead of
// a dead button); platform/podcast prices are resolved server-side.
export type CheckoutRequest =
  | { endpoint: '/api/stripe/checkout'; body: { priceId: string }; missingPrice: boolean }
  | { endpoint: '/api/checkout'; body: { plan: string; productLine: 'platform' | 'podcast' }; missingPrice: false }

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
