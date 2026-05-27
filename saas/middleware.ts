import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const OPERATOR_PATH = '/dashboard/operator'

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith(OPERATOR_PATH)) return NextResponse.next()

  const role = req.headers.get('x-signalboost-role') || 'user'
  if (role === 'owner' || role === 'admin') return NextResponse.next()

  return NextResponse.redirect(new URL('/dashboard', req.url))
}

export const config = {
  matcher: ['/dashboard/operator/:path*'],
}
