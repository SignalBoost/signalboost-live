import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'))
  return m ? m[1].trim() : null
}
function findMeta(html: string, key: 'name' | 'property', value: string): string | null {
  const re = new RegExp('<meta[^>]+' + key + '\\s*=\\s*["\']' + value + '["\'][^>]*>', 'i')
  const m = html.match(re)
  if (!m) return null
  return attr(m[0], 'content') ?? ''
}
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (h === '0.0.0.0' || h === '::1') return true
  return false
}

async function fetchPage(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  const start = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBoostBot/1.0; +website audit)', Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
    })
    const html = (await res.text()).slice(0, 800000)
    return { status: res.status, html, finalUrl: res.url || url, ms: Date.now() - start, bytes: html.length }
  } finally {
    clearTimeout(timer)
  }
}

function runChecks(html: string, finalUrl: string, ms: number, bytes: number): Check[] {
  const checks: Check[] = []
  const lower = html.toLowerCase()

  checks.push(finalUrl.startsWith('https://')
    ? { id: 'https', label: 'HTTPS secure connection', category: 'Security', status: 'pass', detail: 'The page is served over HTTPS.', recommendation: '' }
    : { id: 'https', label: 'HTTPS secure connection', category: 'Security', status: 'fail', detail: 'The page is not served over HTTPS.', recommendation: 'Serve the site over HTTPS with a valid TLS certificate.' })

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : ''
  if (!title) checks.push({ id: 'title', label: 'Page title', category: 'SEO', status: 'fail', detail: 'No <title> tag found.', recommendation: 'Add a descriptive 30–60 character <title>.' })
  else if (title.length < 20 || title.length > 65) checks.push({ id: 'title', label: 'Page title', category: 'SEO', status: 'warn', detail: `Title is ${title.length} characters: “${title.slice(0, 70)}”.`, recommendation: 'Aim for a 30–60 character title with your main keyword.' })
  else checks.push({ id: 'title', label: 'Page title', category: 'SEO', status: 'pass', detail: `“${title}”`, recommendation: '' })

  const desc = findMeta(html, 'name', 'description')
  if (desc === null) checks.push({ id: 'desc', label: 'Meta description', category: 'SEO', status: 'fail', detail: 'No meta description found.', recommendation: 'Add a 50–160 character meta description summarizing the page.' })
  else if (desc.length < 50 || desc.length > 165) checks.push({ id: 'desc', label: 'Meta description', category: 'SEO', status: 'warn', detail: `Description is ${desc.length} characters.`, recommendation: 'Aim for 50–160 characters that invite the click.' })
  else checks.push({ id: 'desc', label: 'Meta description', category: 'SEO', status: 'pass', detail: 'Present and well-sized.', recommendation: '' })

  const h1s = (html.match(/<h1[\s>]/gi) || []).length
  if (h1s === 0) checks.push({ id: 'h1', label: 'Main heading (H1)', category: 'SEO', status: 'fail', detail: 'No <h1> found.', recommendation: 'Add exactly one clear <h1> describing the page.' })
  else if (h1s > 1) checks.push({ id: 'h1', label: 'Main heading (H1)', category: 'SEO', status: 'warn', detail: `${h1s} <h1> tags found.`, recommendation: 'Use a single <h1> per page; demote the rest to <h2>.' })
  else checks.push({ id: 'h1', label: 'Main heading (H1)', category: 'SEO', status: 'pass', detail: 'Exactly one <h1>.', recommendation: '' })

  const viewport = findMeta(html, 'name', 'viewport')
  checks.push(viewport
    ? { id: 'viewport', label: 'Mobile viewport', category: 'Performance', status: 'pass', detail: 'Viewport meta tag present.', recommendation: '' }
    : { id: 'viewport', label: 'Mobile viewport', category: 'Performance', status: 'fail', detail: 'No viewport meta tag.', recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile.' })

  const htmlLang = /<html[^>]+lang\s*=/i.test(html)
  checks.push(htmlLang
    ? { id: 'lang', label: 'Language attribute', category: 'Accessibility', status: 'pass', detail: '<html lang> is set.', recommendation: '' }
    : { id: 'lang', label: 'Language attribute', category: 'Accessibility', status: 'warn', detail: 'No lang attribute on <html>.', recommendation: 'Add lang to <html> (e.g. lang="en") for screen readers and SEO.' })

  const imgs = html.match(/<img\b[^>]*>/gi) || []
  const withAlt = imgs.filter(t => { const a = attr(t, 'alt'); return a !== null && a.length > 0 }).length
  if (imgs.length === 0) checks.push({ id: 'alt', label: 'Image alt text', category: 'Accessibility', status: 'pass', detail: 'No images to check.', recommendation: '' })
  else {
    const pct = Math.round((withAlt / imgs.length) * 100)
    if (pct >= 90) checks.push({ id: 'alt', label: 'Image alt text', category: 'Accessibility', status: 'pass', detail: `${withAlt}/${imgs.length} images have alt text.`, recommendation: '' })
    else if (pct >= 50) checks.push({ id: 'alt', label: 'Image alt text', category: 'Accessibility', status: 'warn', detail: `Only ${pct}% of images have alt text.`, recommendation: 'Add descriptive alt text to every meaningful image.' })
    else checks.push({ id: 'alt', label: 'Image alt text', category: 'Accessibility', status: 'fail', detail: `Only ${pct}% of images have alt text.`, recommendation: 'Add descriptive alt text to images for accessibility and SEO.' })
  }

  const ogTitle = findMeta(html, 'property', 'og:title')
  const ogImage = findMeta(html, 'property', 'og:image')
  if (ogTitle && ogImage) checks.push({ id: 'og', label: 'Social sharing (Open Graph)', category: 'Social', status: 'pass', detail: 'og:title and og:image present.', recommendation: '' })
  else checks.push({ id: 'og', label: 'Social sharing (Open Graph)', category: 'Social', status: 'warn', detail: 'Missing og:title and/or og:image.', recommendation: 'Add Open Graph tags so links preview nicely on social and chat.' })

  checks.push(/<link[^>]+rel\s*=\s*["\']canonical["\']/i.test(html)
    ? { id: 'canonical', label: 'Canonical URL', category: 'SEO', status: 'pass', detail: 'Canonical link present.', recommendation: '' }
    : { id: 'canonical', label: 'Canonical URL', category: 'SEO', status: 'warn', detail: 'No canonical link.', recommendation: 'Add <link rel="canonical"> to avoid duplicate-content issues.' })

  checks.push(lower.includes('application/ld+json')
    ? { id: 'jsonld', label: 'Structured data', category: 'SEO', status: 'pass', detail: 'JSON-LD structured data found.', recommendation: '' }
    : { id: 'jsonld', label: 'Structured data', category: 'SEO', status: 'warn', detail: 'No JSON-LD structured data.', recommendation: 'Add schema.org JSON-LD to enable rich results.' })

  const words = stripTags(html).split(' ').filter(Boolean).length
  if (words >= 300) checks.push({ id: 'content', label: 'Content depth', category: 'SEO', status: 'pass', detail: `~${words} words of visible text.`, recommendation: '' })
  else checks.push({ id: 'content', label: 'Content depth', category: 'SEO', status: 'warn', detail: `Only ~${words} words of visible text.`, recommendation: 'Thin pages rank poorly; add useful, original content.' })

  const kb = Math.round(bytes / 1024)
  if (kb <= 150) checks.push({ id: 'weight', label: 'HTML page weight', category: 'Performance', status: 'pass', detail: `HTML is ~${kb} KB.`, recommendation: '' })
  else if (kb <= 400) checks.push({ id: 'weight', label: 'HTML page weight', category: 'Performance', status: 'warn', detail: `HTML is ~${kb} KB.`, recommendation: 'Trim inline scripts/markup; large HTML slows first paint.' })
  else checks.push({ id: 'weight', label: 'HTML page weight', category: 'Performance', status: 'fail', detail: `HTML is ~${kb} KB.`, recommendation: 'Heavy HTML hurts load time; reduce inline content and defer scripts.' })

  if (ms <= 800) checks.push({ id: 'speed', label: 'Server response time', category: 'Performance', status: 'pass', detail: `Responded in ${ms} ms.`, recommendation: '' })
  else if (ms <= 2500) checks.push({ id: 'speed', label: 'Server response time', category: 'Performance', status: 'warn', detail: `Responded in ${ms} ms.`, recommendation: 'Consider caching/CDN to speed up the initial response.' })
  else checks.push({ id: 'speed', label: 'Server response time', category: 'Performance', status: 'fail', detail: `Responded in ${ms} ms.`, recommendation: 'Slow first byte; use a CDN, caching, and a faster host.' })

  return checks
}

function scoreOf(checks: Check[]): number {
  const val = (s: Status) => (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0)
  const total = checks.length || 1
  const got = checks.reduce((a, c) => a + val(c.status), 0)
  return Math.round((got / total) * 100)
}

function deterministicSummary(checks: Check[], score: number): string {
  const issues = checks.filter(c => c.status !== 'pass')
  if (issues.length === 0) return `Great work — this page passed all ${checks.length} checks (score ${score}/100). Keep monitoring as content changes.`
  const top = issues.slice(0, 5).map((c, i) => `${i + 1}. ${c.label}: ${c.recommendation}`)
  return `Overall score: ${score}/100. Top priorities:\n${top.join('\n')}`
}

async function aiSummary(checks: Check[], score: number, url: string, language: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const findings = checks.map(c => `- [${c.status.toUpperCase()}] ${c.category} · ${c.label}: ${c.detail}${c.recommendation ? ' → ' + c.recommendation : ''}`).join('\n')
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: `You are a website optimization expert. Reply strictly in ${language}. Given audit findings, write a short, practical action plan: a one-line verdict, then 3–6 prioritized fixes in plain language. Be concrete and encouraging. No fluff.` },
        { role: 'user', content: `URL: ${url}\nScore: ${score}/100\nFindings:\n${findings}` },
      ],
    })
    return res.choices[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  // Auth: paid-API route — signed-in users only.
  const authedUser = await getCurrentUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }


  try {
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    let raw = String(body?.url || '').trim()
    if (!raw) return NextResponse.json({ error: 'Please enter a URL.' }, { status: 400 })
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw

    let parsed: URL
    try { parsed = new URL(raw) } catch { return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 }) }
    if (!/^https?:$/.test(parsed.protocol)) return NextResponse.json({ error: 'Only http and https URLs are supported.' }, { status: 400 })
    if (isPrivateHost(parsed.hostname)) return NextResponse.json({ error: 'That host is not allowed.' }, { status: 400 })

    const language = String(body?.language || 'en')

    let page
    try {
      page = await fetchPage(parsed.toString())
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'The site took too long to respond.' : `Could not reach that URL (${e?.message || 'network error'}).`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    if (page.status >= 400) {
      return NextResponse.json({ error: `The site returned HTTP ${page.status}.`, fetchedStatus: page.status }, { status: 502 })
    }

    const checks = runChecks(page.html, page.finalUrl, page.ms, page.bytes)
    const score = scoreOf(checks)
    const ai = await aiSummary(checks, score, page.finalUrl, language)
    const summary = ai || deterministicSummary(checks, score)

    return NextResponse.json({
      url: raw,
      finalUrl: page.finalUrl,
      fetchedStatus: page.status,
      score,
      checks,
      summary,
      source: ai ? 'openai' : 'deterministic',
    })
  } catch (e: any) {
    // Last-resort guard: always return JSON so the client shows a real message, never a crash page.
    return NextResponse.json({ error: `Audit failed: ${e?.message || 'unexpected error'}` }, { status: 500 })
  }
}
