// app/api/brand-profile/route.ts
// Per-user brand profile. SECURITY: was a public, unauthenticated endpoint backed
// by a module-level `let profile` (shared across all callers, lost on redeploy).
// Now requires an authenticated session and persists to a per-user, RLS-scoped
// table — a user can only ever read/write their own profile.

import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

export async function GET() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('brand_profiles')
    .select('profile')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('brand-profile GET error:', error.message)
    return NextResponse.json({ profile: null, error: 'Failed to load profile' }, { status: 500 })
  }
  return NextResponse.json({ profile: data?.profile ?? null })
}

export async function POST(req: Request) {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await req.json().catch(() => ({}))

  const { data, error } = await supabase
    .from('brand_profiles')
    .upsert(
      { user_id: user.id, profile, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('profile')
    .maybeSingle()

  if (error) {
    console.error('brand-profile POST error:', error.message)
    return NextResponse.json({ profile: null, error: 'Failed to save profile' }, { status: 500 })
  }
  return NextResponse.json({ profile: data?.profile ?? profile })
}
