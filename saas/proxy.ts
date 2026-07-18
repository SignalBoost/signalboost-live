import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const OPERATOR_PATH = '/dashboard/operator'
const BLOCKED_ERROR = 'AI execution globally disabled by administrator override.'

// Owner-only access to the AI Website Operator.
// Set OPERATOR_OWNER_EMAILS in the environment (comma-separated) to control who has access,
// without changing code. Falls back to the original owner email if the var is unset.
const OWNER_EMAILS = (process.env.OPERATOR_OWNER_EMAILS || 'cadomos@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  if (isAutonomousIngress(pathname)) {
    if (await autonomousExecutionIsEnabled()) return NextResponse.next()
    return NextResponse.json({ error: BLOCKED_ERROR }, { status: 503 })
  }

  // Only guard the operator path beyond autonomous API ingress.
  if (!pathname.startsWith(OPERATOR_PATH)) {
    return NextResponse.next()
  }

  // Prepare a response we can attach refreshed auth cookies to.
  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()
  const email = data?.user?.email?.toLowerCase() || ''

  if (email && OWNER_EMAILS.includes(email)) {
    return res
  }

  // Not the owner -> send to the dashboard home.
  return NextResponse.redirect(new URL('/dashboard', req.url))
}

function isAutonomousIngress(pathname: string) {
  return pathname.startsWith('/api/cron/')
    || pathname.startsWith('/api/webhook/')
    || pathname.startsWith('/api/hub/webhooks')
    || pathname === '/api/stripe/webhook'
    || pathname.startsWith('/api/autonomous-supervisor/')
    || pathname.startsWith('/api/internal/supervisor/')
}

async function autonomousExecutionIsEnabled() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false

  try {
    const response = await fetch(`${url}/rest/v1/system_status?id=eq.global&select=ai_autonomous_execution_enabled`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!response.ok) return false
    const rows = await response.json() as Array<{ ai_autonomous_execution_enabled?: boolean }>
    return rows[0]?.ai_autonomous_execution_enabled === true
  } catch {
    return false
  }
}

export const config = {
  matcher: ['/dashboard/operator/:path*', '/api/:path*'],
}
