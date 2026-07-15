// saas/lib/credits/renderPricing.ts
// Pure render-credit pricing math — no DB, no imports — so it is unit-testable
// and shared as the single source of truth for markup and credit conversion.

// 3x markup (operator-chosen). Change here only.
export const RENDER_MARKUP = 3

// Safety cap: max PROVIDER spend per user per day, in cents (~$25).
export const DAILY_PROVIDER_CAP_CENTS = 2500

// 1 credit = 1 US cent of provider cost * markup. Always rounds up so the
// platform never undercharges.
export function creditsForProviderCost(providerCostCents: number): number {
  const cents = Math.max(0, Math.ceil(providerCostCents))
  return Math.ceil(cents * RENDER_MARKUP)
}
