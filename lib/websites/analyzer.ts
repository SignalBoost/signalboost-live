import type { WebsiteAuditResult, WebsiteRecommendation, WebsiteScoreKey } from './types'

const MAX_BYTES = 1_500_000
const USER_AGENT = 'SignalBoostWebsiteOptimizer/1.0 (+https://signalboostapp.com)'
const SCORE_KEYS: WebsiteScoreKey[] = ['performance', 'seo', 'accessibility', 'mobile', 'conversion', 'security']

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))) }
function matches(html: string, pattern: RegExp) { return (html.match(pattern) || []).length }
function first(html: string, pattern: RegExp) { return html.match(pattern)?.[1]?.trim() || '' }
function stripTags(value: string) { return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

export function normalizeWebsiteUrl(input: string) {
  const trimmed = input.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs can be analyzed.')
  if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.0\.0\.0)/i.test(url.hostname)) throw new Error('Private and local network URLs are not allowed.')
  url.hash = ''
  return url.toString()
}

async function robotsAllows(url: URL) {
  try {
    const robots = await fetch(`${url.origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(3500) })
    if (!robots.ok) return true
    const text = await robots.text()
    const blocks = text.split(/\n(?=User-agent:)/i)
    return !blocks.some(block => /User-agent:\s*\*/i.test(block) && block.split(/\r?\n/).some(line => {
      const denied = line.match(/^\s*Disallow:\s*(\S+)/i)?.[1]
      return denied && denied !== '/' ? url.pathname.startsWith(denied) : denied === '/'
    }))
  } catch { return true }
}

export async function fetchWebsiteForAnalysis(input: string) {
  const normalized = normalizeWebsiteUrl(input)
  const url = new URL(normalized)
  if (!(await robotsAllows(url))) throw new Error('robots.txt does not allow automated analysis for this URL.')
  const started = Date.now()
  const response = await fetch(normalized, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(12000) })
  const elapsedMs = Date.now() - started
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`)
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) throw new Error('URL did not return an HTML page.')
  const reader = response.body?.getReader()
  if (!reader) return { normalized, finalUrl: response.url, html: await response.text(), elapsedMs, headers: response.headers }
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) break
    chunks.push(value)
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks))
  return { normalized, finalUrl: response.url, html, elapsedMs, headers: response.headers }
}

export function analyzeHtml(inputUrl: string, finalUrl: string, html: string, elapsedMs: number, headers: Headers): WebsiteAuditResult {
  const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDescription = first(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) || first(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)
  const h1 = matches(html, /<h1\b/gi)
  const h2 = matches(html, /<h2\b/gi)
  const images = matches(html, /<img\b/gi)
  const imagesWithAlt = matches(html, /<img\b(?=[^>]*\balt=["'][^"']+["'])/gi)
  const links = matches(html, /<a\b/gi)
  const ctas = matches(html, /\b(get started|start now|book|schedule|buy|subscribe|contact|learn more|try|demo|sign up|call now)\b/gi)
  const forms = matches(html, /<(form|input|textarea|select)\b/gi)
  const buttons = matches(html, /<(button)\b|role=["']button["']/gi)
  const aria = matches(html, /\baria-[a-z]+=/gi)
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html)
  const schema = /application\/ld\+json|itemscope|itemtype=/i.test(html)
  const canonical = /rel=["']canonical["']/i.test(html)
  const text = stripTags(html)
  const sizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024)
  const scriptCount = matches(html, /<script\b/gi)
  const stylesheetCount = matches(html, /<link[^>]+rel=["']stylesheet["']/gi)
  const https = finalUrl.startsWith('https://')
  const securityHeaders = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy'].filter(h => headers.get(h))
  const hasPhoneOrEmail = /\b\+?\d[\d\s().-]{7,}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
  const hasTrust = /testimonial|review|case study|trusted|award|guarantee|secure|certified/i.test(text)

  const recommendations: WebsiteRecommendation[] = []
  const add = (category: WebsiteScoreKey, priority: 'high'|'medium'|'low', recommendation: string, suggested_fix: Record<string, unknown>) => recommendations.push({ category, priority, recommendation, suggested_fix })
  if (elapsedMs > 2500) add('performance', 'high', 'Reduce server response time and cache static assets.', { target_response_ms: 1800, enable_cdn_cache: true })
  if (sizeKb > 900) add('performance', 'medium', 'Compress HTML, defer scripts, and lazy-load media below the fold.', { max_initial_html_kb: 500, lazy_load_images: true })
  if (scriptCount > 18) add('performance', 'medium', 'Audit third-party scripts and remove non-critical blocking JavaScript.', { max_initial_scripts: 12, defer_noncritical_scripts: true })
  if (!title || title.length < 20) add('seo', 'high', 'Add a unique, descriptive title tag between 40 and 60 characters.', { title: title || 'Benefit-led homepage title with brand name' })
  if (!metaDescription || metaDescription.length < 80) add('seo', 'high', 'Add a unique meta description that summarizes the offer and includes a call to action.', { meta_description: 'Describe the customer outcome, audience, and next step in 140–160 characters.' })
  if (h1 !== 1) add('seo', 'medium', 'Use exactly one H1 that states the primary customer outcome.', { h1_count: h1, desired_h1_count: 1 })
  if (!schema) add('seo', 'low', 'Add structured data for Organization, LocalBusiness, Product, or Service where relevant.', { schema_type: 'Organization' })
  if (images > 0 && imagesWithAlt / images < 0.85) add('accessibility', 'high', 'Add descriptive alt text to meaningful images and empty alt text to decorative images.', { images_missing_alt: images - imagesWithAlt })
  if (h1 === 0 || h2 === 0) add('accessibility', 'medium', 'Improve heading hierarchy so screen-reader users can scan sections quickly.', { heading_order: ['h1', 'h2', 'h3'] })
  if (buttons > 0 && aria < Math.max(1, Math.floor(buttons / 2))) add('accessibility', 'low', 'Add accessible names or ARIA labels to icon-only interactive controls.', { add_aria_labels: true })
  if (!viewport) add('mobile', 'high', 'Add a responsive viewport meta tag for mobile rendering.', { viewport: 'width=device-width, initial-scale=1' })
  if (matches(html, /width=["']\d{3,}["']|min-width:\s*\d{3,}px/gi) > 3) add('mobile', 'medium', 'Replace fixed-width layout rules with responsive CSS.', { use_responsive_grid: true })
  if (ctas < 2) add('conversion', 'high', 'Add clear primary and secondary CTAs above the fold and after key proof sections.', { primary_cta: 'Get started', secondary_cta: 'Book a demo' })
  if (!hasTrust) add('conversion', 'medium', 'Add trust signals such as testimonials, review counts, guarantees, or partner logos.', { trust_sections: ['testimonials', 'logos', 'guarantee'] })
  if (!forms && !hasPhoneOrEmail) add('conversion', 'medium', 'Make contact paths visible with a form, email, phone, or scheduling link.', { contact_options: ['form', 'email', 'calendar'] })
  if (!https) add('security', 'high', 'Serve the website over HTTPS only.', { enforce_https: true })
  if (!headers.get('content-security-policy')) add('security', 'medium', 'Add a Content-Security-Policy header to reduce script injection risk.', { header: 'Content-Security-Policy' })
  if (!headers.get('strict-transport-security') && https) add('security', 'low', 'Add an HSTS header for HTTPS hardening.', { header: 'Strict-Transport-Security' })

  const performance = clamp(100 - Math.max(0, elapsedMs - 800) / 45 - Math.max(0, sizeKb - 350) / 12 - Math.max(0, scriptCount - 8) * 2 - Math.max(0, stylesheetCount - 4) * 2)
  const seo = clamp(35 + (title ? 15 : 0) + (metaDescription ? 20 : 0) + (h1 === 1 ? 12 : 0) + (h2 > 0 ? 6 : 0) + (schema ? 7 : 0) + (canonical ? 5 : 0))
  const accessibility = clamp(45 + (images === 0 ? 18 : Math.round((imagesWithAlt / images) * 22)) + (h1 > 0 && h2 > 0 ? 14 : 0) + Math.min(12, aria * 2) + (/<html[^>]+lang=/i.test(html) ? 7 : 0))
  const mobile = clamp(45 + (viewport ? 35 : 0) - Math.min(20, matches(html, /width=["']\d{3,}["']|min-width:\s*\d{3,}px/gi) * 4) + (/<picture\b|srcset=/i.test(html) ? 10 : 0))
  const conversion = clamp(35 + Math.min(28, ctas * 7) + (forms ? 12 : 0) + (hasPhoneOrEmail ? 10 : 0) + (hasTrust ? 15 : 0))
  const security = clamp(40 + (https ? 35 : 0) + securityHeaders.length * 7)

  return { url: inputUrl, normalized_url: finalUrl, fetched_at: new Date().toISOString(), performance, seo, accessibility, mobile, conversion, security, recommendations, raw_report: { title, metaDescription, h1, h2, images, imagesWithAlt, links, ctas, forms, buttons, ariaAttributes: aria, viewport, schema, canonical, elapsedMs, sizeKb, scriptCount, stylesheetCount, https, securityHeaders } }
}

export async function analyzeWebsite(url: string) {
  const fetched = await fetchWebsiteForAnalysis(url)
  return analyzeHtml(url, fetched.finalUrl || fetched.normalized, fetched.html, fetched.elapsedMs, fetched.headers)
}

export function emptyAuditForUrl(url: string): WebsiteAuditResult {
  const now = new Date().toISOString()
  return { url, normalized_url: url, fetched_at: now, performance: 0, seo: 0, accessibility: 0, mobile: 0, conversion: 0, security: 0, recommendations: SCORE_KEYS.map(category => ({ category, priority: 'high', recommendation: `Run a live ${category} audit after the URL is reachable.`, suggested_fix: { category, retry: true } })), raw_report: { error: 'unreachable' } }
}
