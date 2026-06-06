import type { VideoQuota } from './types'

/**
 * Calculate video quota, overage, and export eligibility based on tier and duration.
 * @param tier — 'free' | 'launch' | 'growth' | 'command'
 * @param durationMinutes — total video duration in minutes
 */
export function calculateVideoQuota(tier: string, durationMinutes: number): VideoQuota {
  const tiers: Record<string, { included: number; overage: number }> = {
    free: { included: 10, overage: 0 },
    launch: { included: 120, overage: 0.5 },
    growth: { included: 600, overage: 0.25 },
    command: { included: 2000, overage: 0.1 },
  }
  const tierInfo = tiers[tier] || tiers.free
  const demoOnly = tier === 'free'
  const overage = Math.max(0, durationMinutes - tierInfo.included)

  return {
    usedMinutes: Math.min(durationMinutes, tierInfo.included),
    includedMinutes: tierInfo.included,
    demoOnly,
    requiresOverageCharge: overage > 0 && !demoOnly,
    overageMinutes: overage,
    overageRateUsd: tierInfo.overage,
    overageProvider: overage > 0 ? 'stripe' : 'none',
    exportEnabled: !demoOnly,
  }
}
