import Link from 'next/link'
import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { buildAccountSnapshot, getAccountPlan } from '@/lib/account/plan'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import '../globals.css'

export const metadata = {
  title: 'SignalBoost Unified Cockpit',
}

export const dynamic = 'force-dynamic'

async function getDashboardAccount() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return buildAccountSnapshot(null)
  }

  try {
    const supabase = await createMarketingServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return buildAccountSnapshot(null)

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return buildAccountSnapshot(user, subscription?.plan, subscription?.status)
  } catch {
    return buildAccountSnapshot(null)
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const account = await getDashboardAccount()
  const plan = account.plan.key === 'paid' ? getAccountPlan('growth') : account.plan

  return (
    <div className="min-h-screen bg-[#05070b] text-white lg:flex">
      <aside className="border-b border-white/10 bg-black/80 p-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-start justify-between gap-3 lg:block">
          <div>
            <Link href="/" className="block text-2xl font-black text-[#FFD700] no-underline">SignalBoost</Link>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/40">Operations OS</p>
          </div>
          <Link href="/pricing" className="rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-3 py-2 text-xs font-bold text-[#FFD700] no-underline lg:hidden">
            {plan.badge}
          </Link>
        </div>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[.04] p-4 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#FFD700]/15 text-sm font-black text-[#FFD700]">
              {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : account.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{account.displayName}</p>
              <p className="truncate text-xs text-white/45">{account.email ?? 'Sign in to sync workspace'}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-3 py-1 text-xs font-bold text-[#FFD700]">{plan.badge}</span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{account.subscriptionStatus}</span>
          </div>
          {!account.isAuthenticated ? (
            <Link href="/login" className="mt-4 block rounded-full bg-white px-4 py-2 text-center text-sm font-bold text-black no-underline">
              Sign in
            </Link>
          ) : null}
        </section>

        <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
          <Link href="/dashboard" className="rounded-2xl px-4 py-3 text-sm text-white/80 no-underline transition hover:bg-white/10 hover:text-white">
            Cockpit Overview
          </Link>
          {signalBoostModules.map((module) => (
            <Link key={module.key} href={module.href} className="rounded-2xl px-4 py-3 text-sm text-white/75 no-underline transition hover:bg-[#FFD700]/10 hover:text-[#FFD700]">
              <span className="mr-2">{module.icon}</span>{module.label}
            </Link>
          ))}
          <Link href="/dashboard/league" className="rounded-2xl px-4 py-3 text-sm text-white/75 no-underline transition hover:bg-[#FFD700]/10 hover:text-[#FFD700]">
            <span className="mr-2">🏟️</span>League CRUD
          </Link>
          <Link href="/pricing" className="rounded-2xl px-4 py-3 text-sm text-white/75 no-underline transition hover:bg-[#FFD700]/10 hover:text-[#FFD700]">
            <span className="mr-2">💳</span>Plans & billing
          </Link>
        </nav>

        <div className="mt-6 rounded-3xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-4 text-sm text-white/70">
          <p className="font-bold text-[#FFD700]">Telemetry active</p>
          <p className="mt-2">Module usage, Concierge intents, and Marketplace context roll into Admin Console reporting.</p>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
