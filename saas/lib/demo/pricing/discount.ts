// saas/lib/demo/pricing/discount.ts
import { roundCents } from './rounding.ts'

export function applyDiscount(priceCents: number, percentOff: number): number {
  const discounted = priceCents * (1 - percentOff / 100)
  return roundCents(discounted)
}
