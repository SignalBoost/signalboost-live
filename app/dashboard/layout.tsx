import { signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { buildAccountSnapshot } from '@/lib/account/plan'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'
import '../globals.css'

export const metadata = {
  title: 'SignalBoost Unified Cockpit',
}

export const dynamic = 'force-dynamic'

const primaryModules = signalBoostModules.filter((module) => ['promote', 'reviews', 'calendar', 'spreadsheets', 'outreach'].includes(module.key))
const aiModules = signalBoostModules.filter((module) => ['assistant', 'video'].includes(module.key))

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
      .in('status', ['active', 'trialing', 'past_due'])
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

  return (
    <div className="min-h-screen bg-[#05070b] text-white lg:flex">
      <DashboardSidebar account={account} primaryModules={primaryModules} aiModules={aiModules} />
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
