// saas/lib/ai/tools/getPricing.ts
// Fetches the live SaaS pricing page and extracts plan/price text.
// Used by the assistant's getPricing tool so prices are always current.

const PRICING_URL = 'https://saas.signalboostapp.com/pricing'

let cache: { at: number; text: string } | null = null
const CACHE_MS = 5 * 60 * 1000 // 5 minutes

// Strip HTML tags and collapse whitespace into readable text.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pull just the pricing-relevant slice so we don't feed the model the whole page.
function extractPricingSection(text: string): string {
  // The pricing content sits between the hero and the footer.
  // Grab a generous window around the plan names to keep it focused.
  const start = text.indexOf('Free Demo')
  const end = text.indexOf('Powered by SignalBoost')
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end).trim()
  }
  // Fallback: return a capped chunk if markers move.
  return text.slice(0, 4000)
}

export async function getLivePricing(): Promise<{ ok: boolean; pricing: string; source: string }> {
  // Serve from cache when fresh.
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { ok: true, pricing: cache.text, source: PRICING_URL }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(PRICING_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'SignalBoost-Assistant' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return { ok: false, pricing: '', source: PRICING_URL }
    }

    const html = await res.text()
    const text = htmlToText(html)
    const pricing = extractPricingSection(text)

    cache = { at: Date.now(), text: pricing }
    return { ok: true, pricing, source: PRICING_URL }
  } catch {
    return { ok: false, pricing: '', source: PRICING_URL }
  }
}
