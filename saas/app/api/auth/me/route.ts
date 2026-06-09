import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ isAdmin: false, isOwner: false, role: 'guest', plan: 'free', tier: 'free' })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .maybeSingle()

    const plan = sub?.plan || 'free'
    const ownerEmails = (process.env.OWNER_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const email = user.email?.toLowerCase() || ''
    const isOwner = ownerEmails.includes(email)
    const isAdmin = isOwner || adminEmails.includes(email)

    return NextResponse.json({ isAdmin, isOwner, role: isOwner ? 'owner' : isAdmin ? 'admin' : 'user', plan, tier: plan })
  } catch {
    return NextResponse.json({ isAdmin: false, isOwner: false, role: 'guest', plan: 'free', tier: 'free' })
  }
}
