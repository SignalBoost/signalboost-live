import type { VideoQuota } from './types'
/**
 * Calculate video quota, overage, and export eligibility based on tier and duration.
 * Export is enabled for ALL tiers. Tiers only differ in included minutes and overage rate.
 * @param tier — 'free' | 'launch' | 'growth' | 'command' (legacy: demo, paid, pro, starter)
 * @param durationMinutes — total video duration in minutes
 */
export function calculateVideoQuota(tier: string, durationMinutes: number): VideoQuota {
  const tiers: Record<string, { included: number; overage: number }> = {
    free: { included: 10, overage: 0 },
    demo: { included: 10, overage: 0 },
    launch: { included: 120, overage: 0.5 },
    growth: { included: 600, overage: 0.25 },
    command: { included: 2000, overage: 0.1 },
    // legacy plan values
    starter: { included: 120, overage: 0.5 },
    pro: { included: 600, overage: 0.25 },
    paid: { included: 600, overage: 0.25 },
  }
  const key = String(tier || 'free').toLowerCase()
  const tierInfo = tiers[key] || tiers.free
  const isFree = key === 'free' || key === 'demo'
  const overage = Math.max(0, durationMinutes - tierInfo.included)
  return {
    usedMinutes: Math.min(durationMinutes, tierInfo.included),
    includedMinutes: tierInfo.included,
    demoOnly: false,
    requiresOverageCharge: overage > 0 && !isFree,
    overageMinutes: overage,
    overageRateUsd: tierInfo.overage,
    overageProvider: overage > 0 ? 'stripe' : 'none',
    exportEnabled: true,
  }
}
