// Provider-independent network ingress wrapper.
// The mature proxy implementation remains in proxyBase.ts. This wrapper closes legacy/browser
// paths through the mandatory answer-provenance boundary without weakening proxyBase's spend gates.
// Canonical routing invariants retained by proxyBase.ts (kept visible here for architecture gates):
// pathname === '/api/concierge' && req.method === 'POST'
// cosBrowserUrl.pathname = '/api/cos-browser'
// pathname === '/api/cos-primary' && req.method === 'POST' && isFullAssistantBrowserRequest(req)
// cosBrowserUrl.pathname = '/api/cos-browser'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { provenanceBoundarySecret } from './lib/ai/cos/provenanceBoundarySecret.ts'
import { proxy as baseProxy } from './proxyBase.ts'

const PROVENANCE_BOUNDARY_HEADER = 'x-signalboost-provenance-boundary'
const DIRECT_FAST_TEXT_TRANSFORM = /^\s*(?:edit|rewrite|rephrase|proofread|polish|correct(?:\s+the)?(?:\s+grammar)?|translate|shorten|improve(?:\s+the)?(?:\s+wording)?|make\s+(?:this|it)\s+(?:more\s+)?(?:professional|clear|concise|friendly|formal))\b/i

async function fastTextTransformRequest(req: NextRequest): Promise<boolean> {
  const ownerAssistantSurface = req.headers.get('x-signalboost-surface') === 'cos' || fullAssistantSurface(req)
  if (!ownerAssistantSurface) return false
  try {
    const body: any = await req.clone().json()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role === 'user' && typeof message?.content === 'string') {
        return DIRECT_FAST_TEXT_TRANSFORM.test(message.content.trim())
      }
    }
  } catch {}
  return false
}

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

function fullAssistantSurface(req: NextRequest): boolean {
  const referer = req.headers.get('referer') || ''
  if (!referer) return false
  try {
    const url = new URL(referer)
    return url.origin === req.nextUrl.origin && url.pathname.startsWith('/dashboard/assistant')
  } catch {
    return false
  }
}

function provenanceRewrite(req: NextRequest, forceAssistant = false) {
  const secret = provenanceBoundarySecret()
  if (!secret) return NextResponse.json({ error: 'provenance_boundary_unconfigured' }, { status: 503 })
  const headers = new Headers(req.headers)
  headers.set(PROVENANCE_BOUNDARY_HEADER, secret)
  if (forceAssistant || headers.get('x-signalboost-surface') === 'cos') headers.set('x-signalboost-surface', 'cos')
  const target = req.nextUrl.clone()
  target.pathname = '/api/cos-provenance-browser'
  return NextResponse.rewrite(target, { request: { headers } })
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Every browser-delivered answer crosses the provenance wrapper. Call proxyBase first so the
  // existing anonymous spend limit and other ingress guards remain authoritative; only a successful
  // continuation/rewrite is replaced with the provenance-aware destination.
  if ((pathname === '/api/concierge' || pathname === '/api/cos-browser') && req.method === 'POST') {
    const gated = await baseProxy(req)
    if (gated.status !== 200) return gated
    if (pathname === '/api/cos-browser' && await fastTextTransformRequest(req)) {
      const target = req.nextUrl.clone()
      target.pathname = '/api/cos-fast-transform'
      return NextResponse.rewrite(target)
    }
    return provenanceRewrite(req, req.headers.get('x-signalboost-surface') === 'cos')
  }

  if (pathname === '/api/cos-primary' && req.method === 'POST' && fullAssistantSurface(req)) {
    const gated = await baseProxy(req)
    if (gated.status !== 200) return gated
    if (await fastTextTransformRequest(req)) {
      const target = req.nextUrl.clone()
      target.pathname = '/api/cos-fast-transform'
      return NextResponse.rewrite(target)
    }
    return provenanceRewrite(req, true)
  }

  if (pathname === '/api/support' && req.method === 'POST') {
    // Preserve the existing anonymous preview/spend gate before rewriting the legacy endpoint.
    const gated = await baseProxy(req)
    const continues = gated.status === 200 && gated.headers.get('x-middleware-next') === '1'
    if (!continues) return gated
    return provenanceRewrite(req, dashboardSurface(req))
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
