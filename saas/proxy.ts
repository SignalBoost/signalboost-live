import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const OPERATOR_PATH = '/dashboard/operator'
const BLOCKED_ERROR = 'AI execution globally disabled by administrator override.'
const RATE_WINDOW_MS = 10 * 60_000
const ANONYMOUS_MAX = 8

const buckets = new Map<string, { count: number; resetAt: number }>()
let autonomyStatusInFlight: Promise<boolean> | null = null

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

  // Preserve the former middleware.ts anonymous spend gate inside the single
  // Next.js 16 proxy entrypoint. Signed-in users continue to use the existing
  // plan/credit gates inside the routes themselves.
  if (isPublicModelIngress(pathname) && req.method === 'POST' && !hasSessionCookie(req)) {
    if (overLimit(`anonymous-concierge:${clientIpKey(req)}`)) {
      const language = languageFrom(req)
      return NextResponse.json(
        {
          reply: limitReply(language),
          source: 'anonymous-preview-limit',
          rate_limited: true,
          sign_in_required: true,
          execution_allowed: false,
          external_action_taken: false,
        },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
      )
    }
  }

  // COS-FIRST LIVE ROUTING.
  // Keep /api/concierge as the stable browser endpoint. Browser turns first enter
  // /api/cos-browser, which establishes request-scoped RunPod wake permission and
  // then invokes COS Primary. Direct/server calls to /api/cos-primary bypass that
  // browser wrapper and therefore cannot start paid GPU compute.
  if (pathname === '/api/concierge' && req.method === 'POST') {
    const cosBrowserUrl = req.nextUrl.clone()
    cosBrowserUrl.pathname = '/api/cos-browser'
    return NextResponse.rewrite(cosBrowserUrl)
  }

  // Only guard the operator path beyond autonomous API ingress and the public spend gate.
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

function isPublicModelIngress(pathname: string) {
  return pathname === '/api/concierge' || pathname === '/api/support'
}

function hasSessionCookie(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(cookie.name)) return true
  }
  return false
}

function clientIpKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function overLimit(key: string): boolean {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }

  existing.count += 1

  if (existing.count % 50 === 0 || buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  return existing.count > ANONYMOUS_MAX
}

function languageFrom(req: NextRequest): string {
  const stored = req.cookies.get('sb_locale')?.value || ''
  const normalized = stored.toLowerCase().slice(0, 2)
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(normalized) ? normalized : 'en'
}

function limitReply(language: string): string {
  const messages: Record<string, string> = {
    en: 'You have reached the free preview limit for this assistant. Sign in to keep going — your account has a much higher allowance, and the conversation continues from here.',
    es: 'Ha alcanzado el límite de vista previa gratuita de este asistente. Inicie sesión para continuar: su cuenta tiene un límite mucho mayor y la conversación continúa desde aquí.',
    pt: 'Você atingiu o limite da prévia gratuita deste assistente. Entre na sua conta para continuar: sua conta tem um limite muito maior e a conversa segue a partir daqui.',
    pl: 'Osiągnięto limit bezpłatnego podglądu tego asystenta. Zaloguj się, aby kontynuować — Twoje konto ma znacznie wyższy limit, a rozmowa jest kontynuowana od tego miejsca.',
    ru: 'Достигнут лимит бесплатного предпросмотра этого ассистента. Войдите в аккаунт, чтобы продолжить: там лимит значительно выше, а разговор продолжится с этого места.',
  }
  return messages[language] || messages.en
}

async function readAutonomousExecutionStatus(): Promise<boolean> {
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

async function autonomousExecutionIsEnabled(): Promise<boolean> {
  // Coalesce concurrent checks inside a warm Proxy instance without caching the
  // result. Every new request burst still observes a fresh authoritative value,
  // so the emergency stop does not acquire a stale-allow window.
  if (autonomyStatusInFlight) return autonomyStatusInFlight
  const read = readAutonomousExecutionStatus()
  autonomyStatusInFlight = read
  try {
    return await read
  } finally {
    if (autonomyStatusInFlight === read) autonomyStatusInFlight = null
  }
}

export const config = {
  // Proxy is not free work: only run it on paths that actually need the global
  // autonomy gate, public-model spend gate/routing, or operator authentication.
  matcher: [
    '/dashboard/operator/:path*',
    '/api/concierge',
    '/api/support',
    '/api/cron/:path*',
    '/api/webhook/:path*',
    '/api/hub/webhooks/:path*',
    '/api/stripe/webhook',
    '/api/autonomous-supervisor/:path*',
    '/api/internal/supervisor/:path*',
  ],
}
