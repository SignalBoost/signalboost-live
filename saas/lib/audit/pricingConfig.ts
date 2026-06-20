/**
 * Audit Project — Pricing Configuration
 * Self-contained module. No imports from the core SaaS plan system.
 * Stripe price IDs are read from environment variables at runtime.
 * Until those vars are set the checkout flow shows a "not yet configured" notice.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditCount = number | 'Unlimited';

export type AuditTierId = 'audit_starter' | 'audit_growth' | 'audit_pro' | 'audit_enterprise';

export interface AuditTier {
  id: AuditTierId;
  name: string;
  price: number;
  audits: AuditCount;
  stripePriceIdEnvKey: string;
  isPopular: boolean;
  isEnterprise: boolean;
}

export interface AuditPricingConfig {
  tiers: AuditTier[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const AUDIT_PRICING_CONFIG: AuditPricingConfig = {
  tiers: [
    {
      id: 'audit_starter',
      name: 'Audit Starter',
      price: 29,
      audits: 3,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_STARTER',
      isPopular: false,
      isEnterprise: false,
    },
    {
      id: 'audit_growth',
      name: 'Audit Growth',
      price: 79,
      audits: 20,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_GROWTH',
      isPopular: true,
      isEnterprise: false,
    },
    {
      id: 'audit_pro',
      name: 'Audit Pro',
      price: 199,
      audits: 100,
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_PRO',
      isPopular: false,
      isEnterprise: false,
    },
    {
      id: 'audit_enterprise',
      name: 'Audit Enterprise',
      price: 599,
      audits: 'Unlimited',
      stripePriceIdEnvKey: 'AUDIT_STRIPE_PRICE_ENTERPRISE',
      isPopular: false,
      isEnterprise: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Stripe price ID for a given tier from process.env.
 * Returns null if the env var is not set — callers must handle this case.
 */
export function getAuditStripePriceId(tier: AuditTier): string | null {
  const value: string | undefined = process.env[tier.stripePriceIdEnvKey];
  return value !== undefined && value.length > 0 ? value : null;
}

/**
 * Formats the audit count for display.
 */
export function formatAuditCount(audits: AuditCount): string {
  if (audits === 'Unlimited') return 'Unlimited';
  return String(audits);
}
