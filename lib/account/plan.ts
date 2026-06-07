import type { User } from '@supabase/supabase-js'

export type AccountPlanKey = 'free' | 'launch' | 'growth' | 'command' | 'paid'
export type PlanAction = 'current' | 'included' | 'upgrade' | 'contact' | 'subscribe'

export type AccountPlan = {
  key: AccountPlanKey
  name: string
  badge: string
  rank: number
  monthlyPrice: string
  description: string
  includedModules: string[]
}

export type AccountSnapshot = {
  isAuthenticated: boolean
  email: string | null
  displayName: string
  avatarUrl: string | null
  plan: AccountPlan
  effectivePlan: AccountPlan
  subscriptionStatus: string
  subscriptionStatusLabel: string
  workspaceStatus: 'guest' | 'active' | 'trialing' | 'attention' | 'inactive'
}

export const accountPlans: Record<AccountPlanKey, AccountPlan> = {
  free: {
    key: 'free',
    name: 'Free',
    badge: 'Free workspace',
    rank: 0,
    monthlyPrice: '$0',
    description: 'Explore the SignalBoost cockpit and prepare launch assets before subscribing.',
    includedModules: ['Dashboard overview', 'Concierge preview', 'Video demo previews'],
  },
  launch: {
    key: 'launch',
    name: 'Starter',
    badge: 'Starter plan',
    rank: 1,
    monthlyPrice: '$29/mo',
    description: 'Start promoting a local business with reviews, calendar planning, and launch campaigns.',
    includedModules: ['Promote Business', 'Reviews', 'Calendar'],
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    badge: 'Growth plan',
    rank: 2,
    monthlyPrice: '$79/mo',
    description: 'Add data operations, outreach queues, and assistant-led execution for growing teams.',
    includedModules: ['Spreadsheets', 'Outreach', 'Personal Assistant', 'Video Studio'],
  },
  command: {
    key: 'command',
    name: 'Command',
    badge: 'Command plan',
    rank: 3,
    monthlyPrice: 'Custom',
    description: 'Owner-level operations, admin telemetry, marketplace concierge, and migration support.',
    includedModules: ['Admin Console telemetry', 'Marketplace + SaaS Concierge', 'Priority migration support'],
  },
  paid: {
    key: 'paid',
    name: 'Paid',
    badge: 'Paid plan',
    rank: 2,
    monthlyPrice: '$79/mo',
    description: 'Legacy paid subscription with Growth-level SignalBoost operations access.',
    includedModules: ['Spreadsheets', 'Outreach', 'Personal Assistant', 'Video Studio'],
  },
}

export function normalizeAccountPlan(value: string | null | undefined): AccountPlanKey {
  const plan = String(value ?? 'free').toLowerCase().trim()
  if (plan === 'starter' || plan === 'start' || plan === 'launch_monthly') return 'launch'
  if (plan === 'pro' || plan === 'scale' || plan === 'growth_monthly') return 'growth'
  if (plan === 'enterprise' || plan === 'command_monthly') return 'command'
  if (plan === 'launch' || plan === 'growth' || plan === 'command' || plan === 'paid') return plan
  return 'free'
}

export function getAccountPlan(value: string | null | undefined): AccountPlan {
  return accountPlans[normalizeAccountPlan(value)]
}

export function getEffectiveAccountPlan(plan: AccountPlan): AccountPlan {
  return plan.key === 'paid' ? accountPlans.growth : plan
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null
}

export function getPlanFromUser(user: User | null | undefined) {
  const metadata = user?.app_metadata ?? {}
  const userMetadata = user?.user_metadata ?? {}
  return getAccountPlan(firstString(metadata.plan, metadata.subscription_plan, metadata.tier, userMetadata.plan, userMetadata.subscription_plan, userMetadata.tier))
}

export function getDisplayNameFromUser(user: User | null | undefined) {
  const userMetadata = user?.user_metadata ?? {}
  const email = user?.email ?? null
  return firstString(userMetadata.full_name, userMetadata.name, userMetadata.preferred_username, email) ?? 'Guest operator'
}

export function getAvatarFromUser(user: User | null | undefined) {
  const userMetadata = user?.user_metadata ?? {}
  return firstString(userMetadata.avatar_url, userMetadata.picture)
}

export function formatSubscriptionStatus(status: string | null | undefined, plan: AccountPlan, isAuthenticated: boolean) {
  const normalized = String(status || '').toLowerCase().trim()

  if (!isAuthenticated) return { raw: 'guest', label: 'Guest workspace', workspaceStatus: 'guest' as const }
  if (plan.key === 'free' && !normalized) return { raw: 'free', label: 'No active subscription', workspaceStatus: 'inactive' as const }
  if (normalized === 'trialing') return { raw: normalized, label: 'Trial active', workspaceStatus: 'trialing' as const }
  if (normalized === 'active') return { raw: normalized, label: 'Subscription active', workspaceStatus: 'active' as const }
  if (normalized === 'past_due') return { raw: normalized, label: 'Payment needs attention', workspaceStatus: 'attention' as const }
  if (normalized === 'canceled' || normalized === 'cancelled') return { raw: normalized, label: 'Subscription canceled', workspaceStatus: 'inactive' as const }
  if (normalized) return { raw: normalized, label: normalized.replace(/_/g, ' '), workspaceStatus: 'attention' as const }

  return { raw: plan.key === 'free' ? 'free' : 'active', label: plan.key === 'free' ? 'No active subscription' : 'Subscription active', workspaceStatus: plan.key === 'free' ? 'inactive' as const : 'active' as const }
}

export function buildAccountSnapshot(user: User | null | undefined, planOverride?: string | null, statusOverride?: string | null): AccountSnapshot {
  const plan = planOverride ? getAccountPlan(planOverride) : getPlanFromUser(user)
  const status = formatSubscriptionStatus(statusOverride, plan, Boolean(user))

  return {
    isAuthenticated: Boolean(user),
    email: user?.email ?? null,
    displayName: getDisplayNameFromUser(user),
    avatarUrl: getAvatarFromUser(user),
    plan,
    effectivePlan: getEffectiveAccountPlan(plan),
    subscriptionStatus: status.raw,
    subscriptionStatusLabel: status.label,
    workspaceStatus: status.workspaceStatus,
  }
}

export function getPlanAction(currentPlan: AccountPlan, targetPlan: AccountPlan): PlanAction {
  const effectiveCurrentPlan = getEffectiveAccountPlan(currentPlan)
  if (effectiveCurrentPlan.key === targetPlan.key) return 'current'
  if (effectiveCurrentPlan.rank > targetPlan.rank) return 'included'
  if (effectiveCurrentPlan.key === 'launch' && targetPlan.key === 'growth') return 'upgrade'
  if (targetPlan.key === 'command') return 'contact'
  return 'subscribe'
}
