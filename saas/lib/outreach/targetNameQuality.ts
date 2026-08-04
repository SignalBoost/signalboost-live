// saas/lib/outreach/targetNameQuality.ts
//
// A PAGE TITLE IS NOT A COMPANY NAME.
//
// PORTABLE KERNEL. Pure, no imports, no host coupling.
//
// Discovery can return an article or ranking page and copy its page title into
// `business_name`. The outreach writer then addresses the message to that title as though it
// were a company. This classifier refuses only high-confidence headline shapes; precision is
// deliberately preferred over recall because a false positive blocks a legitimate prospect.

export interface TargetNameVerdict {
  /** True when the supplied name is much more likely to be page copy than a trading name. */
  looksLikePageTitle: boolean
  /** Human-readable signals that produced the decision. Empty for an accepted name. */
  signals: string[]
  /** Operator-facing refusal message. Empty for an accepted name. */
  reason: string
}

const CONTENT_PATH_SEGMENTS = new Set([
  'article', 'articles', 'blog', 'blogs', 'insight', 'insights', 'news', 'post', 'posts',
  'resource', 'resources', 'story', 'stories', 'report', 'reports', 'guide', 'guides',
  'analysis', 'opinion', 'features', 'feature',
])

const GENERIC_HOST_LABELS = new Set([
  'www', 'app', 'api', 'blog', 'news', 'mail', 'portal', 'site', 'web', 'online',
  'com', 'net', 'org', 'io', 'ai', 'co', 'us', 'uk', 'br', 'mx', 'pl', 'ru',
])

function normalize(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compact(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/)
    .filter(Boolean)
}

function parsedUrl(value: unknown): URL | null {
  try {
    return new URL(normalize(value))
  } catch {
    return null
  }
}

function contentPathSignal(url: URL | null): string {
  if (!url) return ''
  const segments = url.pathname.toLowerCase().split('/').filter(Boolean)
  const named = segments.find(segment => CONTENT_PATH_SEGMENTS.has(segment))
  if (named) return `the URL is under the content path “/${named}/”`
  if (/\/(?:19|20)\d{2}\/\d{1,2}(?:\/\d{1,2})?(?:\/|$)/.test(url.pathname)) {
    return 'the URL uses a dated article path'
  }
  const last = segments[segments.length - 1] || ''
  if ((last.match(/-/g) || []).length >= 4) return 'the URL ends in a long headline-style slug'
  return ''
}

function resemblesHostBrand(name: string, url: URL | null): boolean {
  if (!url) return false
  const nameKey = compact(name)
  if (nameKey.length < 3) return false
  return url.hostname
    .replace(/^www\./i, '')
    .split('.')
    .map(compact)
    .filter(label => label.length >= 4 && !GENERIC_HOST_LABELS.has(label))
    .some(label => nameKey.includes(label) || label.includes(nameKey))
}

/**
 * Decide whether a discovered `businessName` is actually an article/page title.
 *
 * Strong editorial phrases fire on their own. Softer structural signals require a content-like
 * URL and no resemblance between the name and the site's host brand.
 */
export function classifyTargetName(input: {
  businessName?: string | null
  businessUrl?: string | null
}): TargetNameVerdict {
  const name = normalize(input.businessName)
  if (!name) return { looksLikePageTitle: false, signals: [], reason: '' }

  const words = wordsOf(name)
  const wordCount = words.length
  const url = parsedUrl(input.businessUrl)
  const pathSignal = contentPathSignal(url)
  const brandMatch = resemblesHostBrand(name, url)
  const signals: string[] = []

  if (wordCount >= 6 && /\b(?:you should know|what you need to know|everything you need to know|you need to know)\b/i.test(name)) {
    signals.push('it addresses the reader like an editorial headline')
  }

  if (/^(?:the\s+)?\d+\s+(?:best|top|ways|reasons|things|tips|trends|leaders|companies|startups|tools|examples)\b/i.test(name)) {
    signals.push('it starts with a numbered list-headline structure')
  }

  if (wordCount >= 5 && /^(?:how|why|what|when|where|who)\b/i.test(name)) {
    signals.push('it starts as a question or explainer headline')
  }

  if (/^(?:the\s+)?(?:rise|future|state|evolution|history)\s+of\b/i.test(name) || /^(?:a|the)\s+(?:complete|definitive|ultimate)\s+guide\b/i.test(name)) {
    signals.push('it uses a common report or guide headline construction')
  }

  if (/^[a-z\u00c0-\u024f][a-z\u00c0-\u024f .-]{1,35}[’']s\s+.+\b(?:revolution|future|rise|boom|transformation|landscape|outlook|renaissance)\b/i.test(name)) {
    signals.push('it is phrased as a place or subject’s editorial theme')
  }

  // Softer evidence is used only when the URL itself looks like content and the proposed name
  // does not resemble the site's host brand. That keeps long legitimate company names from
  // being rejected merely because they contain ordinary words.
  if (!brandMatch && pathSignal) {
    if (wordCount >= 7) signals.push(pathSignal)
    else if (wordCount >= 5 && /[:?!—–-]/.test(name)) signals.push(`${pathSignal} and the name is punctuated like a headline`)
    else if (wordCount >= 5 && /\b(?:guide|report|trends|leaders|landscape|outlook|revolution|future|analysis)\b/i.test(name)) {
      signals.push(`${pathSignal} and the name uses editorial subject language`)
    }
  }

  const looksLikePageTitle = signals.length > 0
  return {
    looksLikePageTitle,
    signals,
    reason: looksLikePageTitle
      ? `“${name}” looks like a page or article title rather than a company name — ${signals[0]}. Use the company’s legal or trading name and its homepage before queueing outreach.`
      : '',
  }
}
