import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { marketingSupabaseCookieOptions } from '@/lib/auth/supabaseCookies'

const ADMIN_PATHS = ['/admin', '/api/admin']

async function lookupAdmin(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceRoleKey || anonKey

  if (!normalizedEmail || !supabaseUrl || !key) return null

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('admin')
    .select('id,email,role,is_primary,created_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } })
  const isAdminPath = ADMIN_PATHS.some((path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith(`${path}/`))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    if (isAdminPath) return NextResponse.redirect(new URL('/login?next=/admin', req.url))
    return res
  }

  const authSupabase = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: marketingSupabaseCookieOptions,
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await authSupabase.auth.getUser()
  const user = data.user
  const admin = await lookupAdmin(user?.email)

  res.cookies.set('sb-session-role', admin ? 'admin' : 'user', { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.cookies.set('sb-session-primary-admin', admin?.is_primary ? 'true' : 'false', { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })

  if (isAdminPath && !admin) {
    const target = req.nextUrl.pathname.startsWith('/api/') ? null : new URL('/login?next=/admin', req.url)
    if (!target) return NextResponse.json({ success: false, error: 'Admin table membership is required.' }, { status: 403 })
    return NextResponse.redirect(target)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
}
