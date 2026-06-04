import OpenAI from 'openai'
import type { WebsiteOptimizerResult } from './types'

const sections: Record<string, string> = { hero: 'hero section', about: 'about section', pricing: 'pricing section', footer: 'footer', services: 'services section', contact: 'contact section' }
function coerceText(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2) }
function words(value: string) { return value.replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean) }
function jsonSafe(result: WebsiteOptimizerResult): WebsiteOptimizerResult { return JSON.parse(JSON.stringify(result)) }

function deterministicOptimize(url: string, section: string, currentContent: unknown): WebsiteOptimizerResult {
  const content = coerceText(currentContent)
  const tokens = words(content).slice(0, 8)
  const brand = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ')
  const sectionLabel = sections[section] || section
  const focus = tokens.length ? tokens.join(' ') : `${brand} customers`
  return jsonSafe({
    headline: `Turn ${focus} into measurable growth`,
    subheadline: `A clearer ${sectionLabel} for ${brand} that explains the outcome, removes friction, and guides visitors to the next step.`,
    body: `Lead with the customer problem, state the business outcome, support it with proof, and keep every sentence tied to one conversion path. Replace vague copy with specific benefits, delivery timelines, trust signals, and a concise next action.`,
    cta: section === 'pricing' ? 'Compare plans' : section === 'contact' || section === 'footer' ? 'Book a consultation' : 'Get started',
    seo: { title: `${brand} ${sectionLabel} optimized for conversions`, description: `Discover how ${brand} helps visitors understand value quickly and take action with accessible, search-ready website copy.`, keywords: [brand, sectionLabel, 'website optimization', 'conversion copy', 'SEO'] },
    layout_changes: ['Move the primary CTA above the fold and repeat it after proof content.', 'Group benefits into short scannable cards with one idea per card.', 'Add trust proof near the first decision point.', 'Use responsive spacing so the section remains readable on mobile.'],
    accessibility_fixes: ['Use one descriptive H1 or H2 for the section.', 'Add meaningful alt text for images and accessible names for icon buttons.', 'Keep color contrast at WCAG AA levels and avoid text embedded in images.'],
  })
}

export async function optimizeWebsiteContent(input: { url: string; section: string; current_content: unknown; language?: string }): Promise<WebsiteOptimizerResult> {
  const fallback = deterministicOptimize(input.url, input.section, input.current_content)
  if (!process.env.OPENAI_API_KEY) return fallback
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Return only JSON matching this schema: {"headline":"","subheadline":"","body":"","cta":"","seo":{"title":"","description":"","keywords":[]},"layout_changes":[],"accessibility_fixes":[]}. No markdown.' },
        { role: 'user', content: JSON.stringify({ task: 'Optimize website section for clarity, SEO, conversion, accessibility', ...input }) },
      ],
    })
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}')
    return jsonSafe({ headline: String(parsed.headline || fallback.headline), subheadline: String(parsed.subheadline || fallback.subheadline), body: String(parsed.body || fallback.body), cta: String(parsed.cta || fallback.cta), seo: { title: String(parsed.seo?.title || fallback.seo.title), description: String(parsed.seo?.description || fallback.seo.description), keywords: Array.isArray(parsed.seo?.keywords) ? parsed.seo.keywords.map(String) : fallback.seo.keywords }, layout_changes: Array.isArray(parsed.layout_changes) ? parsed.layout_changes.map(String) : fallback.layout_changes, accessibility_fixes: Array.isArray(parsed.accessibility_fixes) ? parsed.accessibility_fixes.map(String) : fallback.accessibility_fixes })
  } catch { return fallback }
}
