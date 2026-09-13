// Provider-independent network ingress wrapper.
// The mature proxy implementation remains in proxyBase.ts. This wrapper closes the legacy
// /api/support network path so a stale hosted-provider credential cannot be reached accidentally.
// Canonical routing invariants retained by proxyBase.ts (kept visible here for architecture gates):
// pathname === '/api/concierge' && req.method === 'POST'
// cosBrowserUrl.pathname = '/api/cos-browser'
// pathname === '/api/cos-primary' && req.method === 'POST' && isFullAssistantBrowserRequest(req)
// cosBrowserUrl.pathname = '/api/cos-browser'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { proxy as baseProxy } from './proxyBase'

function dashboardSurface(req: NextRequest): boolean {
  const referer = req.headers.get('referer') || ''
  if (!referer) return false
  try {
    const url = new URL(referer)
    return url.origin === req.nextUrl.origin && url.pathname.startsWith('/dashboard')
  } catch {
    return false
  }
}

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/support' && req.method === 'POST') {
    // Preserve the existing anonymous preview/spend gate before rewriting the legacy endpoint.
    const gated = await baseProxy(req)
    const continues = gated.status === 200 && gated.headers.get('x-middleware-next') === '1'
    if (!continues) return gated

    const headers = new Headers(req.headers)
    if (dashboardSurface(req)) headers.set('x-signalboost-surface', 'cos')
    const target = req.nextUrl.clone()
    target.pathname = '/api/cos-provenance-browser'
    return NextResponse.rewrite(target, { request: { headers } })
  }

  return baseProxy(req)
}

export const config = {
  matcher: [
    '/dashboard/operator/:path*',
    '/api/concierge',
    '/api/cos-browser',
    '/api/support',
    '/api/cos-primary',
    '/api/cron/:path*',
    '/api/webhook/:path*',
    '/api/hub/webhooks/:path*',
    '/api/stripe/webhook',
    '/api/autonomous-supervisor/:path*',
    '/api/internal/supervisor/:path*',
  ],
}
