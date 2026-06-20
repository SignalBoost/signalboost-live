/**
 * saas/lib/audit/pricingConfig.ts
 * Audit Project — standalone pricing configuration.
 * Zero dependencies on core SaaS plan types, credits engine, or webhook system.
 * Stripe price IDs are read from environment variables and default to empty
 * strings so the UI can detect "not yet configured" gracefully.
 */

export type AuditCount = number | "unlimited";

export interface AuditTier {
  /** Internal key — used as React list key and Stripe lookup key. */
  id: "audit_starter" | "audit_growth" | "audit_pro" | "audit_enterprise";
  /** Display name (English). Localised copy lives in auditPricingCopy.ts. */
  nameEn: string;
  /** Monthly price in USD cents (e.g. 2900 = $29.00). */
  priceUsdCents: number;
  /** Human-readable monthly price string. */
  priceDisplay: string;
  /** Number of audits included per billing period. */
  auditCount: AuditCount;
  /** Stripe price ID — populated via environment variable at runtime. */
  stripePriceId: string;
  /** Whether this tier should be visually highlighted as most popular. */
  isPopular: boolean;
}

export interface AuditPricingConfig {
  tiers: AuditTier[];
}

/**
 * Returns the live audit pricing configuration.
 * Stripe price IDs are sourced from environment variables so no ID is ever
 * hard-coded. Until the env vars are set the IDs are empty strings, which
 * the checkout handler treats as "not yet configured".
 */
export function getAuditPricingConfig(): AuditPricingConfig {
  const tiers: AuditTier[] = [
    {
      id: "audit_starter",
      nameEn: "Audit Starter",
      priceUsdCents: 2900,
      priceDisplay: "$29",
      auditCount: 3,
      stripePriceId: process.env.AUDIT_STRIPE_PRICE_STARTER ?? "",
      isPopular: false,
    },
    {
      id: "audit_growth",
      nameEn: "Audit Growth",
      priceUsdCents: 7900,
      priceDisplay: "$79",
      auditCount: 20,
      stripePriceId: process.env.AUDIT_STRIPE_PRICE_GROWTH ?? "",
      isPopular: true,
    },
    {
      id: "audit_pro",
      nameEn: "Audit Pro",
      priceUsdCents: 19900,
      priceDisplay: "$199",
      auditCount: 100,
      stripePriceId: process.env.AUDIT_STRIPE_PRICE_PRO ?? "",
      isPopular: false,
    },
    {
      id: "audit_enterprise",
      nameEn: "Audit Enterprise",
      priceUsdCents: 59900,
      priceDisplay: "$599",
      auditCount: "unlimited",
      stripePriceId: process.env.AUDIT_STRIPE_PRICE_ENTERPRISE ?? "",
      isPopular: false,
    },
  ];

  return { tiers };
}

/**
 * Returns a human-readable audit count string.
 * Kept here so both the config and the UI share the same formatting logic.
 */
export function formatAuditCount(count: AuditCount): string {
  if (count === "unlimited") return "Unlimited";
  return count.toString();
}
