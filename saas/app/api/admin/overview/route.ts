import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// Safely count rows in a table; returns 0 if the table doesn't exist or errors.
async function countRows(admin: any, table: string, filter?: (q: any) => any): Promise<number> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const admin = getAdminSupabase()

  // Count everything in parallel; each is individually safe.
  const [
    reviews,
    approvedReviews,
    campaigns,
    activeCampaigns,
    leads,
    approvedLeads,
    projects,
    publishedProjects,
    teamMembers,
    subscriptions,
  ] = await Promise.all([
    countRows(admin, 'reviews'),
    countRows(admin, 'reviews', q => q.eq('approved', true)),
    countRows(admin, 'marketing_campaigns'),
    countRows(admin, 'marketing_campaigns', q => q.eq('status', 'active')),
    countRows(admin, 'leads'),
    countRows(admin, 'leads', q => q.eq('status', 'approved')),
    countRows(admin, 'projects'),
    countRows(admin, 'projects', q => q.eq('status', 'live')),
    countRows(admin, 'team_members'),
    countRows(admin, 'subscriptions'),
  ])

  // Plan distribution from subscriptions (best-effort).
  let plans: Record<string, number> = {}
  try {
    const { data } = await admin.from('subscriptions').select('plan')
    if (Array.isArray(data)) {
      for (const row of data) {
        const p = String((row as any).plan || 'free')
        plans[p] = (plans[p] || 0) + 1
      }
    }
  } catch { /* leave plans empty */ }

  // Total registered users (auth) — best-effort via admin auth API.
  let totalUsers = 0
  try {
    const { data } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 1 })
    // listUsers returns the page; total isn't always exposed, so fall back to team/subscription counts.
    totalUsers = data?.total ?? data?.users?.length ?? 0
  } catch {
    totalUsers = 0
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    content: {
      reviews,
      approvedReviews,
      campaigns,
      activeCampaigns,
      projects,
      publishedProjects,
      leads,
      approvedLeads,
    },
    accounts: {
      totalUsers,
      teamMembers,
      subscriptions,
      plans,
    },
  })
}
