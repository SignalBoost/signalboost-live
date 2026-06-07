'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { createMarketingBrowserSupabase } from '@/lib/auth/supabaseClient'
import { buildAccountSnapshot, getAccountPlan, getPlanAction, type AccountSnapshot, type PlanAction } from '@/lib/account/plan'

const tiers = [
  {
    plan: getAccountPlan('launch'),
    translationKey: 'pricing.tier.launch',
    modules: ['Promote Business', 'Reviews', 'Calendar'],
    bestFor: 'New local businesses validating one repeatable growth motion.',
    outcome: 'Launch your first campaign and reputation loop.',
  },
  {
    plan: getAccountPlan('growth'),
    translationKey: 'pricing.tier.growth',
    modules: ['Spreadsheets', 'Outreach', 'Personal Assistant', 'Video Studio'],
    bestFor: 'Teams ready to coordinate leads, content, outreach, and reporting.',
    outcome: 'Upgrade Starter into a complete operating cockpit.',
    highlighted: true,
  },
  {
    plan: getAccountPlan('command'),
    translationKey: 'pricing.tier.command',
    modules: ['Admin Console telemetry', 'Marketplace + SaaS Concierge', 'Priority migration support'],
    bestFor: 'Owners, agencies, and regional operators that need guided implementation.',
    outcome: 'Add executive rollout support and regional governance.',
  },
]

function actionCopy(action: PlanAction) {
  if (action === 'current') return { label: 'Current Plan', helper: 'You already own this plan. Duplicate checkout is disabled.', tone: 'disabled' }
  if (action === 'included') return { label: 'Included', helper: 'Your current plan already includes this tier or better.', tone: 'disabled' }
  if (action === 'upgrade') return { label: 'Upgrade to Growth', helper: 'Move from Starter to Growth without creating a duplicate Starter subscription.', tone: 'primary' }
  if (action === 'contact') return { label: 'Contact sales', helper: 'Command plans are scoped with the SignalBoost operations team.', tone: 'secondary' }
  return { label: 'Start subscription', helper: 'Subscribe when you are ready to activate this workspace.', tone: 'primary' }
}

function statusClass(status: AccountSnapshot['workspaceStatus']) {
  if (status === 'active') return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
  if (status === 'trialing') return 'border-sky-300/20 bg-sky-400/10 text-sky-200'
  if (status === 'attention') return 'border-amber-300/30 bg-amber-400/10 text-amber-100'
  return 'border-white/10 bg-black/40 text-white/60'
}

export default function PricingPage() {
  const { t } = useTranslation()
  const [account, setAccount] = useState<AccountSnapshot>(() => buildAccountSnapshot(null))
  const [loadingAccount, setLoadingAccount] = useState(true)
  const supabase = useMemo(() => createMarketingBrowserSupabase(), [])

  useEffect(() => {
    let mounted = true

    async function loadAccount() {
      setLoadingAccount(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) setAccount(buildAccountSnapshot(null))
          return
        }

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan,status')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (mounted) setAccount(buildAccountSnapshot(user, subscription?.plan, subscription?.status))
      } catch {
        if (mounted) setAccount(buildAccountSnapshot(null))
      } finally {
        if (mounted) setLoadingAccount(false)
      }
    }

    loadAccount()
    return () => { mounted = false }
  }, [supabase])

  const currentPlan = account.effectivePlan
  const hasStarterUpgrade = currentPlan.key === 'launch'

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white md:px-8">
      <Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link>
      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-end">
        <div className="max-w-4xl">
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('pricing.kicker')}</p>
          <h1 className="mt-4 text-4xl font-black md:text-6xl">{t('pages.pricing.title')}</h1>
          <p className="mt-5 text-lg text-neutral-400 md:text-xl">{t('pricing.subtitle')}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/60">
            <span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">No duplicate active-plan checkout</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">Starter → Growth upgrade path</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2">Sign-in protected billing</span>
          </div>
        </div>
        <aside className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
          <p className="text-sm text-white/50">Account status</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-3 py-1 text-sm font-bold text-[#FFD700]">
              {loadingAccount ? 'Checking plan…' : currentPlan.badge}
            </span>
            <span className={`rounded-full border px-3 py-1 text-sm ${statusClass(account.workspaceStatus)}`}>{account.subscriptionStatusLabel}</span>
          </div>
          <p className="mt-4 text-sm text-white/60">
            {account.isAuthenticated ? `Signed in as ${account.email}` : 'Sign in before checkout so SignalBoost can attach your subscription to the right workspace.'}
          </p>
          {hasStarterUpgrade ? (
            <div className="mt-4 rounded-2xl border border-[#FFD700]/25 bg-[#FFD700]/10 p-3 text-sm text-[#FFD700]">
              Growth is available as your next upgrade. Starter checkout is locked to prevent duplicates.
            </div>
          ) : null}
          {!account.isAuthenticated ? <Link href="/login" className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-bold text-black no-underline">Sign in</Link> : null}
        </aside>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        {tiers.map((tier) => {
          const action = getPlanAction(currentPlan, tier.plan)
          const copy = actionCopy(action)
          const disabled = action === 'current' || action === 'included'
          const href = action === 'contact' ? '/support' : account.isAuthenticated ? '/dashboard' : '/login'

          return (
            <article key={tier.plan.key} className={`relative flex flex-col rounded-3xl border p-6 ${tier.highlighted ? 'border-[#FFD700]/50 bg-[#FFD700]/10 shadow-[0_0_50px_rgba(255,215,0,.12)]' : 'border-white/10 bg-white/[.04]'}`}>
              {tier.highlighted ? <span className="absolute right-5 top-5 rounded-full bg-[#FFD700] px-3 py-1 text-xs font-black text-black">Best upgrade</span> : null}
              {action === 'current' ? <span className="mb-4 w-fit rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">Current workspace plan</span> : null}
              <h2 className="text-2xl font-bold">{t(tier.translationKey)}</h2>
              <p className="mt-3 text-4xl font-black text-[#FFD700]">{tier.plan.monthlyPrice}</p>
              <p className="mt-4 min-h-12 text-sm text-white/60">{tier.bestFor}</p>
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">{tier.outcome}</p>
              <ul className="mt-5 flex-1 space-y-3 text-white/75">
                {tier.modules.map((module) => <li key={module}>✓ {module}</li>)}
              </ul>
              {disabled ? (
                <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-full border border-white/10 bg-white/10 px-5 py-3 font-bold text-white/45">
                  {copy.label}
                </button>
              ) : (
                <Link href={href} className={`mt-6 block rounded-full px-5 py-3 text-center font-bold no-underline ${copy.tone === 'secondary' ? 'border border-[#FFD700]/40 text-[#FFD700]' : 'bg-[#FFD700] text-black'}`}>
                  {copy.label}
                </Link>
              )}
              <p className="mt-3 text-xs leading-5 text-white/45">{copy.helper}</p>
            </article>
          )
        })}
      </section>

      <section className="mt-10 rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#FFD700]">{t('pricing.modules.title')}</h2>
            <p className="mt-2 text-white/70">{t('pricing.modules.subtitle')}</p>
          </div>
          <Link href="/dashboard" className="rounded-full border border-[#FFD700]/30 px-4 py-2 text-sm font-bold text-[#FFD700] no-underline hover:bg-[#FFD700]/10">Open cockpit</Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {signalBoostModules.map((module) => (
            <Link key={module.key} href={module.href} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white no-underline transition hover:border-[#FFD700]">
              <span className="mr-2">{module.icon}</span>{module.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
