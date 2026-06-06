import type { SubscriptionTier, VideoQuota } from '@/lib/video/types'

const includedByTier: Record<SubscriptionTier, number> = {
  free: 2,
  demo: 2,
  launch: 60,
  growth: 240,
  command: 1200,
  paid: 240,
}

export function normalizeTier(value: string | null | undefined): SubscriptionTier {
  const tier = String(value ?? 'free').toLowerCase()
  if (tier === 'demo' || tier === 'launch' || tier === 'growth' || tier === 'command' || tier === 'paid') return tier
  return 'free'
}

export function calculateVideoQuota(tierInput: string | null | undefined, usedMinutesInput: number, provider: 'stripe' | 'paypal' = 'stripe'): VideoQuota {
  const tier = normalizeTier(tierInput)
  const usedMinutes = Math.max(0, Number.isFinite(usedMinutesInput) ? usedMinutesInput : 0)
  const includedMinutes = includedByTier[tier]
  const overageMinutes = Math.max(0, Math.ceil(usedMinutes - includedMinutes))
  const demoOnly = tier === 'free' || tier === 'demo'
  return {
    tier,
    usedMinutes,
    includedMinutes,
    overageMinutes,
    overageRateUsd: 0.18,
    exportEnabled: !demoOnly,
    demoOnly,
    requiresOverageCharge: !demoOnly && overageMinutes > 0,
    overageProvider: provider,
  }
}

export function assertCanExport(quota: VideoQuota) {
  if (quota.demoOnly || !quota.exportEnabled) {
    return { allowed: false, reason: 'Free/demo users can preview short demo clips only. Upgrade to export full videos.' }
  }
  return { allowed: true, reason: quota.requiresOverageCharge ? 'Overage charge required before export starts.' : 'Export allowed.' }
}
