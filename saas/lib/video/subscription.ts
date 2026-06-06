import type { SupabaseClient } from '@supabase/supabase-js'

export type VideoPlan = 'free' | 'trial' | 'starter' | 'pro' | 'business'
export type SubscriptionDecision =
  | { allowed: false; reason: 'demo_only'; plan: VideoPlan; used: number; quota: number; requiresBilling: false }
  | { allowed: false; reason: 'over_quota'; plan: VideoPlan; used: number; quota: number; requiresBilling: true }
  | { allowed: true; reason: 'included' | 'metered_extra'; plan: VideoPlan; used: number; quota: number; requiresBilling: boolean }

export const VIDEO_EXPORT_QUOTAS: Record<VideoPlan, number> = {
  free: 0,
  trial: 0,
  starter: 10,
  pro: 40,
  business: 150,
}

export const PAID_VIDEO_PLANS = new Set<VideoPlan>(['starter', 'pro', 'business'])

export function normalizeVideoPlan(plan: unknown): VideoPlan {
  const value = String(plan ?? 'free').toLowerCase()
  if (value === 'starter' || value === 'pro' || value === 'business' || value === 'trial') return value
  return 'free'
}

export async function getSubscriptionDecision(supabase: SupabaseClient, userId: string): Promise<SubscriptionDecision> {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status, video_exports_used, video_export_quota')
    .eq('user_id', userId)
    .maybeSingle()

  const active = subscription?.status === 'active' || subscription?.status === 'trialing'
  const plan = active ? normalizeVideoPlan(subscription?.plan) : 'free'
  const quota = Number(subscription?.video_export_quota ?? VIDEO_EXPORT_QUOTAS[plan] ?? 0)
  const used = Math.max(0, Number(subscription?.video_exports_used ?? 0))

  if (!PAID_VIDEO_PLANS.has(plan)) {
    return { allowed: false, reason: 'demo_only', plan, used, quota, requiresBilling: false }
  }

  if (used >= quota) {
    return { allowed: false, reason: 'over_quota', plan, used, quota, requiresBilling: true }
  }

  return { allowed: true, reason: 'included', plan, used, quota, requiresBilling: false }
}

export async function incrementVideoExportUsage(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase
    .from('subscriptions')
    .select('video_exports_used')
    .eq('user_id', userId)
    .maybeSingle()

  const used = Math.max(0, Number(data?.video_exports_used ?? 0)) + 1
  await supabase
    .from('subscriptions')
    .update({ video_exports_used: used, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}
