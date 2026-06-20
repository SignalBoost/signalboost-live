/**
 * Audit Project — Pricing Configuration
 * Single source of truth for all 4 audit tiers.
 * Stripe price IDs are read from environment variables at runtime.
 * No existing SaaS plan (Launch / Growth / Command) is referenced here.
 */

export type AuditCount = number | 'Unlimited';

export interface AuditTier {
  id: 'starter' | 'growth' | 'pro' | 'enterprise';
  priceMonthly: number;
  auditsPerMonth: AuditCount;
  stripePriceIdEnvKey: string;
  highlighted: boolean;
}

export interface AuditPricingConfig {
  tiers: AuditTier[];
  currencySymbol: string;
  billingPeriod: 'monthly';
}

export const AUDIT_PRICING_CONFIG: AuditPricingConfig = {
  currencySymbol: '$',
  billingPeriod: 'monthly',
  tiers: [
    {
      id: 'starter',
      priceMonthly: 29,
      auditsPerMonth: 3,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_STARTER',
      highlighted: false,
    },
    {
      id: 'growth',
      priceMonthly: 79,
      auditsPerMonth: 20,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_GROWTH',
      highlighted: true,
    },
    {
      id: 'pro',
      priceMonthly: 199,
      auditsPerMonth: 100,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_PRO',
      highlighted: false,
    },
    {
      id: 'enterprise',
      priceMonthly: 599,
      auditsPerMonth: 'Unlimited',
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_ENTERPRISE',
      highlighted: false,
    },
  ],
};

/**
 * Safely resolves the Stripe price ID for a given tier from process.env.
 * Returns null if the env var is not set — callers must guard against null
 * before initiating checkout.
 */
export function resolveStripePriceId(tier: AuditTier): string | null {
  const value: string | undefined = process.env[tier.stripePriceIdEnvKey];
  return value ?? null;
}

/**
 * Formats the audit count for display.
 * Returns the number as a string, or 'Unlimited' as-is.
 */
export function formatAuditCount(count: AuditCount): string {
  if (count === 'Unlimited') return 'Unlimited';
  return String(count);
}
