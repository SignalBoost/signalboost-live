/**
 * saas/lib/audit/pricingConfig.ts
 * Single source of truth for Audit pricing tiers.
 * Fully self-contained — no imports from platform plan types.
 */

export type AuditCount = number | "Unlimited";

export interface AuditTier {
  id: "starter" | "growth" | "pro" | "enterprise";
  stripePriceEnvKey: string;
  monthlyUsd: number;
  auditCount: AuditCount;
  isPopular: boolean;
  isEnterprise: boolean;
  features: readonly string[];
}

export interface AuditPricingConfig {
  tiers: readonly AuditTier[];
}

export const AUDIT_PRICING_CONFIG: AuditPricingConfig = {
  tiers: [
    {
      id: "starter",
      stripePriceEnvKey: "AUDIT_STRIPE_PRICE_STARTER",
      monthlyUsd: 29,
      auditCount: 3,
      isPopular: false,
      isEnterprise: false,
      features: [
        "3 full site audits per month",
        "SEO & performance scoring",
        "Branded PDF export",
        "Email delivery",
        "5-language reports",
      ],
    },
    {
      id: "growth",
      stripePriceEnvKey: "AUDIT_STRIPE_PRICE_GROWTH",
      monthlyUsd: 79,
      auditCount: 20,
      isPopular: true,
      isEnterprise: false,
      features: [
        "20 full site audits per month",
        "Competitor benchmarking",
        "Priority processing",
        "Branded PDF export",
        "Email delivery",
        "5-language reports",
      ],
    },
    {
      id: "pro",
      stripePriceEnvKey: "AUDIT_STRIPE_PRICE_PRO",
      monthlyUsd: 199,
      auditCount: 100,
      isPopular: false,
      isEnterprise: false,
      features: [
        "100 full site audits per month",
        "White-label reports",
        "API access",
        "Competitor benchmarking",
        "Priority processing",
        "5-language reports",
      ],
    },
    {
      id: "enterprise",
      stripePriceEnvKey: "AUDIT_STRIPE_PRICE_ENTERPRISE",
      monthlyUsd: 599,
      auditCount: "Unlimited",
      isPopular: false,
      isEnterprise: true,
      features: [
        "Unlimited audits",
        "Dedicated account manager",
        "Custom integrations",
        "White-label reports",
        "API access",
        "SLA guarantee",
        "5-language reports",
      ],
    },
  ],
} as const;

export function getStripePriceId(envKey: string): string {
  const value: string | undefined = process.env[envKey];
  return value ?? "";
}

export function formatAuditCount(count: AuditCount): string {
  if (count === "Unlimited") return "Unlimited";
  return String(count);
}
