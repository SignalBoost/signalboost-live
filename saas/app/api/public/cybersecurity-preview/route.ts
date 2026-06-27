// saas/app/api/public/cybersecurity-preview/route.ts
// Public cybersecurity preview.
// Safe by design: checks only public HTTP/HTTPS web security signals.
// No port scanning, no exploit testing, no credentialed/private access,
// no crawling, no persistence, and no automatic changes.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BODY_BYTES = 4_000
const MAX_HTML_BYTES = 400_000
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type Body = { url?: unknown }
type Finding = {
  code: string
  category: 'transport' | 'headers' | 'cookies' | 'content' | 'exposure'
  severity: 'high' | 'medium' | 'low'
  value?: string | number | boolean
}

async function readJsonLimited(req: Request): Promise<{ ok: true; value: Body } | { ok: false; error: string; status: number }> {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) return { ok: false, error: 'Content-Type must be application/json', status: 415 }
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body is too large', status: 413 }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return { ok: false, error: 'Invalid JSON body', status: 400 }
    return { ok: true, value: value as Body }
  } catch {
    return { ok: false, error: 'Invalid JSON body', status: 400 }
  }
}

function sameOriginOk(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('host')
  if (!host) return false
  try { return new URL(origin).host === host } catch { return false }
}

function clientIpKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string) {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  existing.count += 1
  if (existing.count % 50 === 0 || rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
  }
  return existing.count > RATE_MAX
}

function normalizeUrl(raw: unknown): URL | null {
  const input = String(raw || '').trim().slice(0, 300)
  if (!input) return null
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(withProtocol)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return null
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null
    if (host === '::1' || host.startsWith('[')) return null
    url.hash = ''
    return url
  } catch {
    return null
  }
}

function header(headers: Headers, name: string) {
  return headers.get(name) || ''
}

function allSetCookies(headers: Headers) {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === 'function') return anyHeaders.getSetCookie()
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function add(findings: Finding[], code: Finding['code'], category: Finding['category'], severity: Finding['severity'], value?: Finding['value']) {
  findings.push({ code, category, severity, value })
}

function scoreFrom(findings: Finding[]) {
  const penalty = findings.reduce((sum, f) => sum + (f.severity === 'high' ? 16 : f.severity === 'medium' ? 9 : 4), 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

export async function POST(req: Request) {
  if (!sameOriginOk(req)) return NextResponse.json({ ok: false, error: 'Cross-origin request rejected' }, { status: 403 })

  const ipKey = clientIpKey(req)
  if (rateLimited(`public-cybersecurity-preview:${ipKey}`)) {
    return NextResponse.json({ ok: false, error: 'Too many checks from this network. Please try again later.' }, { status: 429 })
  }

  const parsed = await readJsonLimited(req)
  if (parsed.ok === false) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status })

  const target = normalizeUrl(parsed.value.url)
  if (!target) return NextResponse.json({ ok: false, error: 'Paste a valid public website URL.' }, { status: 400 })

  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)

  try {
    const res = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'SignalBoost Cybersecurity Preview/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    clearTimeout(timer)

    const html = (await res.text()).slice(0, MAX_HTML_BYTES)
    const findings: Finding[] = []
    const finalUrl = new URL(res.url)
    const responseMs = Date.now() - startedAt

    const csp = header(res.headers, 'content-security-policy')
    const hsts = header(res.headers, 'strict-transport-security')
    const xFrame = header(res.headers, 'x-frame-options')
    const xcto = header(res.headers, 'x-content-type-options')
    const referrerPolicy = header(res.headers, 'referrer-policy')
    const permissionsPolicy = header(res.headers, 'permissions-policy')
    const server = header(res.headers, 'server')
    const poweredBy = header(res.headers, 'x-powered-by')
    const cors = header(res.headers, 'access-control-allow-origin')
    const cookies = allSetCookies(res.headers)

    if (target.protocol !== 'https:') add(findings, 'not_https_input', 'transport', 'high')
    if (finalUrl.protocol !== 'https:') add(findings, 'not_https_final', 'transport', 'high')
    if (target.protocol === 'http:' && finalUrl.protocol === 'http:') add(findings, 'no_https_redirect', 'transport', 'high')

    if (!csp) add(findings, 'missing_csp', 'headers', 'medium')
    else if (!/default-src|script-src|object-src|frame-ancestors/i.test(csp)) add(findings, 'weak_csp', 'headers', 'medium')
    if (finalUrl.protocol === 'https:' && !hsts) add(findings, 'missing_hsts', 'headers', 'medium')
    if (!xFrame && !/frame-ancestors/i.test(csp)) add(findings, 'missing_clickjacking_protection', 'headers', 'medium')
    if (!/nosniff/i.test(xcto)) add(findings, 'missing_nosniff', 'headers', 'low')
    if (!referrerPolicy) add(findings, 'missing_referrer_policy', 'headers', 'low')
    if (!permissionsPolicy) add(findings, 'missing_permissions_policy', 'headers', 'low')
    if (cors.trim() === '*') add(findings, 'wildcard_cors', 'headers', 'medium')

    const insecureCookies = cookies.filter(cookie => !/;\s*secure/i.test(cookie)).length
    const noHttpOnlyCookies = cookies.filter(cookie => !/;\s*httponly/i.test(cookie)).length
    const noSameSiteCookies = cookies.filter(cookie => !/;\s*samesite=/i.test(cookie)).length
    if (insecureCookies > 0) add(findings, 'cookie_missing_secure', 'cookies', 'medium', insecureCookies)
    if (noHttpOnlyCookies > 0) add(findings, 'cookie_missing_httponly', 'cookies', 'low', noHttpOnlyCookies)
    if (noSameSiteCookies > 0) add(findings, 'cookie_missing_samesite', 'cookies', 'low', noSameSiteCookies)

    const mixedContentRefs = (html.match(/(?:src|href)=["']http:\/\//gi) || []).length
    if (finalUrl.protocol === 'https:' && mixedContentRefs > 0) add(findings, 'mixed_content_references', 'content', 'medium', mixedContentRefs)

    if (server) add(findings, 'server_header_exposed', 'exposure', 'low')
    if (poweredBy) add(findings, 'powered_by_exposed', 'exposure', 'low')
    if (responseMs > 3500) add(findings, 'slow_security_response', 'exposure', 'low', responseMs)

    const categoryCounts = findings.reduce<Record<string, number>>((acc, finding) => {
      acc[finding.category] = (acc[finding.category] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      ok: true,
      scanMode: 'public_cybersecurity_preview',
      generatedAt: new Date().toISOString(),
      target: target.toString(),
      finalUrl: finalUrl.toString(),
      status: res.status,
      summary: {
        score: scoreFrom(findings),
        responseMs,
        findings: findings.length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        categoryCounts,
      },
      signals: {
        httpsFinal: finalUrl.protocol === 'https:',
        csp: Boolean(csp),
        hsts: Boolean(hsts),
        clickjackingProtection: Boolean(xFrame || /frame-ancestors/i.test(csp)),
        nosniff: /nosniff/i.test(xcto),
        referrerPolicy: Boolean(referrerPolicy),
        permissionsPolicy: Boolean(permissionsPolicy),
        cookiesObserved: cookies.length,
        serverHeaderObserved: Boolean(server),
        poweredByObserved: Boolean(poweredBy),
      },
      findings: findings.slice(0, 12),
      limits: { publicHeadersOnly: true, onePageOnly: true, noPortScanning: true, noExploitTesting: true, noPrivateAccess: true, remediationLocked: true },
      upgrade: { productLine: 'cybersecurity', offer: 'SignalBoost can prepare an owner-approved security improvement plan.' },
    })
  } catch {
    clearTimeout(timer)
    return NextResponse.json({ ok: false, error: 'Could not load this public website.' }, { status: 400 })
  }
}
