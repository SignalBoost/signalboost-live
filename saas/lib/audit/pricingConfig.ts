// saas/lib/audit/pricingConfig.ts
// Audit-module pricing tiers — fully self-contained, zero external imports.
// Plan names match the DB values in credits.ts: free | starter | pro | business

export type AuditPlanId = 'free' | 'starter' | 'pro' | 'business'

export interface AuditPricingTier {
  id: AuditPlanId
  monthlyPrice: number
  annualPrice: number
  auditsPerMonth: number | null   // null = unlimited
  maxFilesPerRun: number
  historyDays: number
  patchGeneration: boolean
  teamSeats: number | null        // null = unlimited
  support: 'community' | 'email' | 'priority' | 'dedicated'
}

export const AUDIT_PRICING_TIERS: AuditPricingTier[] = [
  {
    id: 'free',
    monthlyPrice: 0,
    annualPrice: 0,
    auditsPerMonth: 3,
    maxFilesPerRun: 6,
    historyDays: 7,
    patchGeneration: false,
    teamSeats: 1,
    support: 'community',
  },
  {
    id: 'starter',
    monthlyPrice: 29,
    annualPrice: 24,
    auditsPerMonth: 20,
    maxFilesPerRun: 20,
    historyDays: 30,
    patchGeneration: true,
    teamSeats: 3,
    support: 'email',
  },
  {
    id: 'pro',
    monthlyPrice: 79,
    annualPrice: 66,
    auditsPerMonth: 100,
    maxFilesPerRun: 40,
    historyDays: 90,
    patchGeneration: true,
    teamSeats: 10,
    support: 'priority',
  },
  {
    id: 'business',
    monthlyPrice: 199,
    annualPrice: 166,
    auditsPerMonth: null,
    maxFilesPerRun: 60,
    historyDays: 365,
    patchGeneration: true,
    teamSeats: null,
    support: 'dedicated',
  },
]

export const POPULAR_PLAN: AuditPlanId = 'pro'
