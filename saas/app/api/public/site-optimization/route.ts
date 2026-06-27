// saas/app/api/public/site-optimization/route.ts
// Public website optimization preview.
// Safe by design: public HTTP/HTTPS websites only, capped body size, no crawling,
// no persistence, no login/private access, no automatic changes.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BODY_BYTES = 4_000
const MAX_HTML_BYTES = 650_000
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type Body = { url?: unknown }
type Finding = {
  code: string
  category: 'performance' | 'seo' | 'accessibility' | 'security' | 'conversion'
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

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0
}

function getMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function getTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return String(match?.[1] || '').replace(/\s+/g, ' ').trim()
}

function hasInputLikeCta(html: string) {
  return /<form\b/i.test(html) || /href=["'][^"']*(contact|signup|sign-up|demo|pricing|book|trial|buy|get-started|start|quote)[^"']*["']/i.test(html)
}

function add(findings: Finding[], code: Finding['code'], category: Finding['category'], severity: Finding['severity'], value?: Finding['value']) {
  findings.push({ code, category, severity, value })
}

function scoreFrom(findings: Finding[]) {
  const penalty = findings.reduce((sum, f) => sum + (f.severity === 'high' ? 14 : f.severity === 'medium' ? 8 : 4), 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}

export async function POST(req: Request) {
  if (!sameOriginOk(req)) return NextResponse.json({ ok: false, error: 'Cross-origin request rejected' }, { status: 403 })

  const ipKey = clientIpKey(req)
  if (rateLimited(`public-site-optimization:${ipKey}`)) {
    return NextResponse.json({ ok: false, error: 'Too many scans from this network. Please try again later.' }, { status: 429 })
  }

  const parsed = await readJsonLimited(req)
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status })

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
        'user-agent': 'SignalBoost Website Optimization Preview/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    clearTimeout(timer)

    const contentType = header(res.headers, 'content-type').toLowerCase()
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({ ok: false, error: 'This URL did not return an HTML page.' }, { status: 400 })
    }

    const raw = await res.text()
    const html = raw.slice(0, MAX_HTML_BYTES)
    const loadMs = Date.now() - startedAt
    const bytes = Buffer.byteLength(html, 'utf8')
    const findings: Finding[] = []

    const title = getTitle(html)
    const description = getMeta(html, 'description')
    const viewport = getMeta(html, 'viewport')
    const ogTitle = getMeta(html, 'og:title')
    const ogDescription = getMeta(html, 'og:description')
    const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html)
    const h1Count = countMatches(html, /<h1\b/gi)
    const scriptCount = countMatches(html, /<script\b/gi)
    const stylesheetCount = countMatches(html, /<link[^>]+rel=["']stylesheet["']/gi)
    const imageCount = countMatches(html, /<img\b/gi)
    const imagesWithoutAlt = countMatches(html, /<img\b(?![^>]*\balt=)/gi)
    const lazyImages = countMatches(html, /<img\b[^>]*\bloading=["']lazy["']/gi)
    const gzip = /gzip|br|zstd/i.test(header(res.headers, 'content-encoding'))
    const cache = header(res.headers, 'cache-control')
    const csp = header(res.headers, 'content-security-policy')
    const hsts = header(res.headers, 'strict-transport-security')
    const xcto = header(res.headers, 'x-content-type-options')
    const robots = getMeta(html, 'robots')
    const hasCta = hasInputLikeCta(html)

    if (loadMs > 3000) add(findings, 'slow_response', 'performance', 'high', loadMs)
    else if (loadMs > 1500) add(findings, 'moderate_response', 'performance', 'medium', loadMs)
    if (bytes > 450_000) add(findings, 'large_html', 'performance', 'medium', bytes)
    if (scriptCount > 18) add(findings, 'many_scripts', 'performance', 'medium', scriptCount)
    if (stylesheetCount > 8) add(findings, 'many_stylesheets', 'performance', 'low', stylesheetCount)
    if (imageCount > 6 && lazyImages === 0) add(findings, 'missing_lazy_images', 'performance', 'medium', imageCount)
    if (!gzip && bytes > 80_000) add(findings, 'missing_compression', 'performance', 'medium', bytes)
    if (!cache) add(findings, 'missing_cache_header', 'performance', 'low')

    if (!title) add(findings, 'missing_title', 'seo', 'high')
    else if (title.length < 25 || title.length > 70) add(findings, 'title_length', 'seo', 'medium', title.length)
    if (!description) add(findings, 'missing_description', 'seo', 'high')
    else if (description.length < 80 || description.length > 170) add(findings, 'description_length', 'seo', 'medium', description.length)
    if (!viewport) add(findings, 'missing_viewport', 'seo', 'high')
    if (!canonical) add(findings, 'missing_canonical', 'seo', 'low')
    if (h1Count !== 1) add(findings, 'h1_count', 'seo', h1Count === 0 ? 'high' : 'medium', h1Count)
    if (/noindex/i.test(robots)) add(findings, 'robots_noindex', 'seo', 'high')
    if (!ogTitle || !ogDescription) add(findings, 'missing_social_meta', 'seo', 'low')

    if (imagesWithoutAlt > 0) add(findings, 'images_missing_alt', 'accessibility', 'medium', imagesWithoutAlt)
    if (!/<html[^>]+lang=["'][a-z-]+["']/i.test(html)) add(findings, 'missing_html_lang', 'accessibility', 'medium')

    if (target.protocol !== 'https:') add(findings, 'not_https', 'security', 'high')
    if (!csp) add(findings, 'missing_csp', 'security', 'medium')
    if (target.protocol === 'https:' && !hsts) add(findings, 'missing_hsts', 'security', 'low')
    if (!/nosniff/i.test(xcto)) add(findings, 'missing_nosniff', 'security', 'low')

    if (!hasCta) add(findings, 'missing_cta', 'conversion', 'medium')

    const categoryCounts = findings.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      ok: true,
      scanMode: 'public_site_optimization_preview',
      generatedAt: new Date().toISOString(),
      target: target.toString(),
      finalUrl: res.url,
      status: res.status,
      summary: {
        score: scoreFrom(findings),
        loadMs,
        htmlBytes: bytes,
        findings: findings.length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        categoryCounts,
      },
      metrics: { titleLength: title.length, descriptionLength: description.length, scriptCount, stylesheetCount, imageCount, imagesWithoutAlt, h1Count, lazyImages },
      findings: findings.slice(0, 12),
      limits: { onePageOnly: true, maxHtmlBytes: MAX_HTML_BYTES, noPrivateAccess: true, remediationLocked: true },
      upgrade: { productLine: 'optimization', offer: 'SignalBoost can review the site and prepare an owner-approved optimization plan.' },
    })
  } catch {
    clearTimeout(timer)
    return NextResponse.json({ ok: false, error: 'Could not load this public website.' }, { status: 400 })
  }
}
