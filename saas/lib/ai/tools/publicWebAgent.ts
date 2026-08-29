// saas/lib/ai/tools/publicWebAgent.ts
// Provider-free web access for COS: discover URLs, fetch the page, read text.
// Brave is optional. If the paid index is empty or out of credit, COS still works.

export type PublicPage = {
  title: string
  url: string
  snippet: string
}

function stripTags(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Preserve page structure so COS can extract list entries from the page itself.
    .replace(/<\/?(?:li|p|h[1-6]|br|tr|div|a)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim()
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const raw = await res.text()
    return stripTags(raw).slice(0, 80_000)
  } finally {
    clearTimeout(timer)
  }
}

function decodeDuckHref(href: string): string {
  try {
    const url = new URL(href, 'https://html.duckduckgo.com')
    const uddg = url.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : href
  } catch {
    return href
  }
}

export async function searchPublicWeb(query: string, count = 8): Promise<PublicPage[]> {
  const q = String(query || '').trim()
  if (!q) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let html = ''
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'text/html', 'User-Agent': 'SignalBoostCOS/1.0' },
    })
    if (!res.ok) throw new Error(`discover ${res.status}`)
    html = await res.text()
  } finally {
    clearTimeout(timer)
  }

  const found: PublicPage[] = []
  const seen = new Set<string>()
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) && found.length < count) {
    const url = decodeDuckHref(match[1])
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    const title = stripTags(match[2]).slice(0, 200)
    found.push({ title: title || url, url, snippet: '' })
  }

  const pages = await Promise.all(
    found.slice(0, Math.min(count, 5)).map(async page => {
      try {
        const body = await fetchText(page.url)
        return { ...page, snippet: body.slice(0, 1200) }
      } catch {
        return page
      }
    }),
  )
  return pages.filter(page => page.url)
}

export async function readPublicPages(urls: string[]): Promise<PublicPage[]> {
  const unique = [...new Set(urls.filter(url => /^https?:\/\//i.test(url)))].slice(0, 5)
  const pages = await Promise.all(
    unique.map(async url => {
      const body = await fetchText(url)
      return { title: url, url, snippet: body.slice(0, 60_000) }
    }),
  )
  return pages.filter(page => page.snippet)
}
