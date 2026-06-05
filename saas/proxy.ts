import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const OPERATOR_PATH = '/dashboard/operator'

// Owner-only access to the AI Website Operator.
// Set OPERATOR_OWNER_EMAILS in the environment (comma-separated) to control who has access,
// without changing code. Falls back to the original owner email if the var is unset.
const OWNER_EMAILS = (process.env.OPERATOR_OWNER_EMAILS || 'cadomos@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export async function proxy(req: NextRequest) {
  // Only guard the operator path; everything else passes through untouched.
  if (!req.nextUrl.pathname.startsWith(OPERATOR_PATH)) {
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

export const config = {
  matcher: ['/dashboard/operator/:path*'],
}
