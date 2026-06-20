// saas/lib/audit/pricingConfig.ts
// Audit-module pricing config — self-contained, zero external imports.
// Four commercial tiers, all purchasable: starter | growth | pro | enterprise.
//
// Price IDs are pulled from env (never hardcoded). They MUST be referenced
// statically (process.env.NEXT_PUBLIC_…) so Next inlines them into the client
// bundle — a dynamic process.env[key] lookup is NOT inlined and returns
// undefined in the browser. STRIPE_PRICE_IDS below is that static map.

export type AuditPlanId = 'starter' | 'growth' | 'pro' | 'enterprise'

export interface AuditTier {
  id: AuditPlanId
  isPopular: boolean
  isEnterprise: boolean
  auditCount: number            // audits per month; -1 = unlimited
  monthlyCredits: number | null // audit/building credits granted per month; null = custom/high-volume
  topupAvailable: boolean       // can purchase instant one-time credit top-ups
  stripePriceEnvKey: string     // the NEXT_PUBLIC_* env var holding this tier's price id
  monthlyPrice: number
}

export interface AuditPricingConfig {
  tiers: AuditTier[]
}

export const AUDIT_PRICING_CONFIG: AuditPricingConfig = {
  tiers: [
    {
      id: 'starter',
      isPopular: false,
      isEnterprise: false,
      auditCount: 20,
      monthlyCredits: 1000,
      topupAvailable: true,
      stripePriceEnvKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER',
      monthlyPrice: 29,
    },
    {
      id: 'growth',
      isPopular: true,
      isEnterprise: false,
      auditCount: 100,
      monthlyCredits: 3000,
      topupAvailable: true,
      stripePriceEnvKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH',
      monthlyPrice: 79,
    },
    {
      id: 'pro',
      isPopular: false,
      isEnterprise: false,
      auditCount: 300,
      monthlyCredits: 10000,
      topupAvailable: true,
      stripePriceEnvKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO',
      monthlyPrice: 199,
    },
    {
      id: 'enterprise',
      isPopular: false,
      isEnterprise: false,
      auditCount: -1,
      monthlyCredits: null,
      topupAvailable: false,
      stripePriceEnvKey: 'NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE',
      monthlyPrice: 599,
    },
  ],
}

export const POPULAR_PLAN: AuditPlanId = 'growth'

// Static references → Next inlines these into the client bundle. Do NOT convert
// this to a dynamic process.env[key] lookup; it would resolve to undefined client-side.
const STRIPE_PRICE_IDS: Record<string, string> = {
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER:    process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH:     process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO:        process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO ?? '',
  NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE: process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE ?? '',
}

export function getStripePriceId(envKey: string): string {
  if (!envKey) return ''
  return STRIPE_PRICE_IDS[envKey] ?? ''
}

export function formatAuditCount(auditCount: number): string {
  if (auditCount < 0) return 'Unlimited audits / mo'
  return `${auditCount.toLocaleString()} audits / mo`
}

export function formatCredits(monthlyCredits: number | null): string {
  if (monthlyCredits === null) return 'Custom high-volume building credits'
  return `${monthlyCredits.toLocaleString()} monthly audit/building credits`
}
