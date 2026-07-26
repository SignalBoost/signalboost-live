// saas/lib/enterprise/url-intelligence/analyze.ts
import schema from '@/config/master_config_schema.json'
import { safeFetchPublicSource } from './safeFetch.ts'
import type { ConfidenceValue, UrlIntelligenceResult } from './types.ts'

const config = schema.enterprise_config
const CONFIRM_BELOW = 70

type Candidate = { value: string; terms: string[]; base?: number }

function decode(value: string) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
}

function meta(html: string, names: string[]) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return decode(match[1])
    }
  }
  return ''
}

function visibleText(html: string) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).slice(0, 30_000)
}

function links(html: string, baseUrl: string) {
  const found = new Set<string>()
  const pattern = /href=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    try { found.add(new URL(match[1], baseUrl).toString()) } catch { /* ignore malformed links */ }
  }
  return [...found]
}

function confidence(value: string, score: number, evidence: string[], alternatives?: string[]): ConfidenceValue {
  return { value, confidence: Math.max(45, Math.min(99, Math.round(score))), evidence: evidence.slice(0, 4), alternatives: alternatives?.filter((item) => item !== value).slice(0, 3) }
}

function choose(text: string, candidates: Candidate[], fallback: string, fallbackScore = 55): ConfidenceValue {
  const lower = text.toLowerCase()
  const ranked = candidates.map((candidate) => {
    const matches = candidate.terms.filter((term) => lower.includes(term.toLowerCase()))
    return { value: candidate.value, score: (candidate.base || 52) + matches.length * 10, matches }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.matches.length === 0) return confidence(fallback, fallbackScore, ['No strong source signal; confirmation required.'], ranked.slice(0, 3).map((item) => item.value))
  return confidence(best.value, best.score, best.matches.map((term) => `Matched source term: ${term}`), ranked.slice(1, 4).map((item) => item.value))
}

function chooseMany(text: string, candidates: Candidate[], fallback: string, limit = 2) {
  const lower = text.toLowerCase()
  const matches = candidates.map((candidate) => {
    const terms = candidate.terms.filter((term) => lower.includes(term.toLowerCase()))
    return { candidate, terms, score: (candidate.base || 55) + terms.length * 10 }
  }).filter((item) => item.terms.length).sort((a, b) => b.score - a.score).slice(0, limit)
  if (!matches.length) return [confidence(fallback, 58, ['No strong source signal; confirmation required.'])]
  return matches.map(({ candidate, terms, score }) => confidence(candidate.value, score, terms.map((term) => `Matched source term: ${term}`)))
}

const industries: Candidate[] = [
  { value: 'Technology & Software', terms: ['software', 'saas', 'api', 'developer', 'cloud', 'cybersecurity', 'artificial intelligence', 'machine learning', 'github'] },
  { value: 'Professional Services', terms: ['consulting', 'agency', 'professional services', 'advisory'] },
  { value: 'Financial Services', terms: ['finance', 'banking', 'fintech', 'payments', 'insurance'] },
  { value: 'Healthcare', terms: ['healthcare', 'medical', 'patient', 'clinic', 'hospital'] },
  { value: 'Travel & Hospitality', terms: ['travel', 'hotel', 'booking', 'flight', 'hospitality', 'tourism'] },
  { value: 'Retail & E-commerce', terms: ['ecommerce', 'e-commerce', 'shop', 'store', 'retail', 'cart'] },
  { value: 'Education & Training', terms: ['education', 'training', 'course', 'learning', 'school'] },
  { value: 'Manufacturing', terms: ['manufacturing', 'factory', 'industrial', 'supply chain'] },
  { value: 'Media & Entertainment', terms: ['media', 'podcast', 'video', 'music', 'entertainment', 'publisher'] },
  { value: 'Government & Public Sector', terms: ['government', 'public sector', 'municipal', 'federal'] },
  { value: 'Nonprofit', terms: ['nonprofit', 'non-profit', 'charity', 'foundation'] },
]

const goals: Candidate[] = [
  { value: 'Lead Generation', terms: ['contact us', 'request information', 'get started', 'lead generation', 'book a call'] },
  { value: 'Brand Awareness', terms: ['about us', 'our mission', 'brand', 'community', 'story'] },
  { value: 'Educational/Training', terms: ['learn', 'documentation', 'docs', 'academy', 'tutorial', 'training', 'guide'] },
  { value: 'Sales Conversion', terms: ['buy now', 'pricing', 'purchase', 'checkout', 'start free trial', 'book a demo'] },
]

const audiences: Candidate[] = [
  { value: 'C-Suite', terms: ['executive', 'ceo', 'c-suite', 'leadership', 'enterprise leader'] },
  { value: 'IT Managers', terms: ['it manager', 'information technology', 'security team', 'infrastructure', 'administrator'] },
  { value: 'Developers', terms: ['developer', 'api', 'sdk', 'github', 'code', 'open source'] },
  { value: 'Marketing Leads', terms: ['marketing', 'campaign', 'growth team', 'brand manager'] },
  { value: 'Procurement', terms: ['procurement', 'vendor', 'purchasing', 'request for proposal', 'rfp'] },
]

const tones: Candidate[] = [
  { value: 'Technical & Precise', terms: ['api', 'sdk', 'technical', 'documentation', 'architecture', 'security', 'framework'] },
  { value: 'Enthusiastic & Creative', terms: ['creative', 'inspire', 'exciting', 'community', 'creator'] },
  { value: 'Urgent & Direct', terms: ['limited time', 'act now', 'urgent', 'today only', 'immediately'] },
  { value: 'Professional & Conservative', terms: ['enterprise', 'compliance', 'governance', 'professional', 'trusted'] },
]

function inferRegion(text: string, language?: string) {
  const lower = `${text} ${language || ''}`.toLowerCase()
  if (/\b(brazil|brasil|portuguese|pt-br)\b/.test(lower)) return confidence('brazil', 90, ['Brazilian or Portuguese-language signal detected.'])
  if (/\b(poland|polska|polish|pl-pl)\b/.test(lower)) return confidence('poland', 90, ['Polish market or language signal detected.'])
  if (/\b(russian|русск|ru-ru)\b/.test(lower)) return confidence('global_ru', 88, ['Russian-language signal detected.'])
  if (/\b(latam|latin america|méxico|mexico|colombia|argentina|spanish|es-)\b/.test(lower)) return confidence('latam', 82, ['Latin American or Spanish-language signal detected.'])
  return confidence('us', 62, ['No explicit regional signal; defaulting to United States for confirmation.'], ['latam', 'brazil', 'poland'])
}

function inferPlatforms(text: string, sourceType: 'website' | 'github') {
  const candidates: Candidate[] = [
    { value: 'LinkedIn', terms: ['linkedin.com'] }, { value: 'YouTube', terms: ['youtube.com', 'youtu.be', 'video'] },
    { value: 'Facebook', terms: ['facebook.com'] }, { value: 'Instagram', terms: ['instagram.com'] },
    { value: 'TikTok', terms: ['tiktok.com'] }, { value: 'Email', terms: ['mailto:', 'newsletter', 'email campaign'] },
    { value: 'Press Outreach', terms: ['press release', 'newsroom', 'media contact'] }, { value: 'Website', terms: ['website', 'landing page'] },
  ]
  const inferred = chooseMany(text, candidates, sourceType === 'github' ? 'Website' : 'Website', 3)
  return inferred
}

function inferFormat(text: string) {
  return choose(text, [
    { value: 'Landing Page', terms: ['landing page', 'website', 'homepage'] },
    { value: 'Email Campaign', terms: ['newsletter', 'email campaign', 'mailto:'] },
    { value: 'Social Campaign', terms: ['linkedin', 'facebook', 'instagram', 'social media'] },
    { value: 'Short Video', terms: ['tiktok', 'reel', 'short video'] },
    { value: 'Long-form Video', terms: ['youtube', 'webinar', 'long-form video'] },
    { value: 'Press Release', terms: ['press release', 'newsroom'] },
    { value: 'Sales Enablement', terms: ['sales', 'demo', 'case study'] },
    { value: 'Training Content', terms: ['documentation', 'tutorial', 'training', 'academy'] },
  ], 'Landing Page', 60)
}

function inferOffer(text: string) {
  return choose(text, [
    { value: 'Free Trial', terms: ['free trial', 'start free', 'try free'] }, { value: 'Product Demo', terms: ['book a demo', 'request a demo', 'demo'] },
    { value: 'Consultation', terms: ['consultation', 'book a call', 'schedule a call'] }, { value: 'Limited-Time Offer', terms: ['limited time', 'special offer'] },
    { value: 'Educational Resource', terms: ['download guide', 'whitepaper', 'documentation', 'ebook'] }, { value: 'Event Registration', terms: ['register', 'webinar', 'event'] },
    { value: 'Direct Purchase', terms: ['buy now', 'checkout', 'purchase'] }, { value: 'Contact Sales', terms: ['contact sales', 'talk to sales'] },
  ], 'Contact Sales', 58)
}

function inferCta(text: string) {
  return choose(text, [
    { value: 'Start Free Trial', terms: ['start free trial', 'try free'] }, { value: 'Book a Demo', terms: ['book a demo', 'request a demo'] },
    { value: 'Request Information', terms: ['request information', 'contact us'] }, { value: 'Download Resource', terms: ['download', 'whitepaper', 'guide'] },
    { value: 'Register Now', terms: ['register now', 'sign up for event'] }, { value: 'Buy Now', terms: ['buy now', 'purchase now'] },
    { value: 'Contact Sales', terms: ['contact sales', 'talk to sales'] }, { value: 'Learn More', terms: ['learn more', 'read more'] },
  ], 'Learn More', 60)
}

function technologySignals(text: string) {
  const technologies = ['Next.js', 'React', 'TypeScript', 'JavaScript', 'Python', 'Node.js', 'Supabase', 'PostgreSQL', 'Vercel', 'AWS', 'Docker', 'Kubernetes', 'OpenAI', 'Anthropic']
  return technologies.filter((technology) => text.toLowerCase().includes(technology.toLowerCase()))
}

async function githubDetails(url: URL) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase() !== 'github.com' || parts.length < 2) return null
  const owner = parts[0]
  const name = parts[1].replace(/\.git$/i, '')
  const fetched = await safeFetchPublicSource(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
  const json = JSON.parse(fetched.body) as Record<string, unknown>
  return {
    owner, name,
    title: String(json.full_name || `${owner}/${name}`),
    description: String(json.description || ''),
    language: typeof json.language === 'string' ? json.language : undefined,
    stars: typeof json.stargazers_count === 'number' ? json.stargazers_count : undefined,
    forks: typeof json.forks_count === 'number' ? json.forks_count : undefined,
    license: typeof (json.license as Record<string, unknown> | null)?.spdx_id === 'string' ? String((json.license as Record<string, unknown>).spdx_id) : undefined,
    topics: Array.isArray(json.topics) ? json.topics.map(String).slice(0, 20) : [],
    defaultBranch: typeof json.default_branch === 'string' ? json.default_branch : undefined,
    homepage: typeof json.homepage === 'string' ? json.homepage : '',
  }
}

export async function analyzePublicUrl(input: string): Promise<UrlIntelligenceResult> {
  const normalized = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`
  const original = new URL(normalized)
  const github = await githubDetails(original)
  let sourceType: 'website' | 'github' = github ? 'github' : 'website'
  let finalUrl = normalized
  let title = github?.title || ''
  let description = github?.description || ''
  let language = github?.language
  let keywords: string[] = github?.topics || []
  let socialLinks: string[] = []
  let sourceText = [title, description, language, ...(github?.topics || [])].filter(Boolean).join(' ')

  if (!github) {
    const fetched = await safeFetchPublicSource(normalized)
    finalUrl = fetched.finalUrl
    const html = fetched.body
    title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    description = meta(html, ['description', 'og:description', 'twitter:description'])
    language = html.match(/<html[^>]+lang=["']([^"']+)/i)?.[1]
    keywords = meta(html, ['keywords']).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20)
    const pageLinks = links(html, fetched.finalUrl)
    socialLinks = pageLinks.filter((link) => /linkedin\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com/i.test(link)).slice(0, 20)
    sourceText = [title, description, visibleText(html), keywords.join(' '), socialLinks.join(' ')].join(' ')
  } else if (github.homepage) {
    sourceText += ` ${github.homepage}`
  }

  const industry = choose(sourceText, industries, 'Other', 58)
  const goal = choose(sourceText, goals, 'Brand Awareness', 60)
  const inferredAudiences = chooseMany(sourceText, audiences, sourceType === 'github' ? 'Developers' : 'C-Suite', 2)
  const tone = choose(sourceText, tones, sourceType === 'github' ? 'Technical & Precise' : 'Professional & Conservative', 65)
  const region = inferRegion(sourceText, language)
  const platforms = inferPlatforms(`${sourceText} ${socialLinks.join(' ')}`, sourceType)
  const format = inferFormat(sourceText)
  const offerType = inferOffer(sourceText)
  const ctaStrategy = inferCta(sourceText)
  const detected = { industry, goal, audiences: inferredAudiences, tone, region, platforms, format, offerType, ctaStrategy }
  const requiresConfirmation = Object.entries(detected).flatMap(([key, item]) => Array.isArray(item) ? (item.some((entry) => entry.confidence < CONFIRM_BELOW) ? [key] : []) : item.confidence < CONFIRM_BELOW ? [key] : [])

  return {
    sourceType,
    sourceUrl: normalized,
    finalUrl,
    title: title || original.hostname,
    description,
    organization: github?.owner,
    repository: github ? { owner: github.owner, name: github.name, primaryLanguage: github.language, stars: github.stars, forks: github.forks, license: github.license, topics: github.topics, defaultBranch: github.defaultBranch } : undefined,
    detected,
    metadata: { language, keywords, socialLinks, technologies: technologySignals(sourceText) },
    requiresConfirmation,
    analyzedAt: new Date().toISOString(),
  }
}

export const urlIntelligenceSchemaValues = {
  industries: config.industries,
  goals: config.goals,
  audiences: config.audiences,
  tones: config.tones,
  regions: config.regions.map((region) => region.id),
  platforms: config.platforms,
  formats: config.formats,
  offerTypes: config.offer_types,
  ctaStrategies: config.cta_strategies,
}
