import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const OPERATOR_PATH = '/dashboard/operator'

// Only these emails may access the AI Website Operator while it is owner-only.
// Add more here later, or replace with a role/plan check when opening to users.
const OWNER_EMAILS = ['cadomos@gmail.com']

export async function middleware(req: NextRequest) {
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
