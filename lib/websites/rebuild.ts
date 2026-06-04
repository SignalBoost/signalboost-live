import OpenAI from 'openai'
import { analyzeWebsite, emptyAuditForUrl } from './analyzer'
import type { WebsiteAuditResult, WebsiteRebuildResult } from './types'

const localeCopy: Record<string, { home: string; about: string; services: string; pricing: string; contact: string; cta: string; reason: string }> = {
  en: { home: 'Home', about: 'About', services: 'Services', pricing: 'Pricing', contact: 'Contact', cta: 'Start your growth plan', reason: 'The current site has optimization gaps that can limit mobile speed, search visibility, trust, or conversion.' },
  es: { home: 'Inicio', about: 'Nosotros', services: 'Servicios', pricing: 'Precios', contact: 'Contacto', cta: 'Iniciar plan de crecimiento', reason: 'El sitio actual tiene brechas de optimización que pueden limitar velocidad móvil, visibilidad SEO, confianza o conversión.' },
  pt: { home: 'Início', about: 'Sobre', services: 'Serviços', pricing: 'Preços', contact: 'Contato', cta: 'Iniciar plano de crescimento', reason: 'O site atual tem lacunas de otimização que podem limitar velocidade móvel, SEO, confiança ou conversão.' },
  pl: { home: 'Start', about: 'O nas', services: 'Usługi', pricing: 'Cennik', contact: 'Kontakt', cta: 'Rozpocznij plan wzrostu', reason: 'Obecna strona ma luki optymalizacyjne, które mogą ograniczać szybkość mobilną, SEO, zaufanie lub konwersję.' },
  ru: { home: 'Главная', about: 'О нас', services: 'Услуги', pricing: 'Цены', contact: 'Контакты', cta: 'Запустить план роста', reason: 'На текущем сайте есть пробелы оптимизации, которые могут снижать мобильную скорость, SEO, доверие или конверсию.' },
}
function lang(code?: string) { const short = String(code || 'en').slice(0,2).toLowerCase(); return localeCopy[short] ? short : 'en' }
function brandFromUrl(url: string) { try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ') } catch { return 'your brand' } }
function safe<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }

function deterministicRebuild(sourceUrl: string, language: string, businessType = 'business', audit?: WebsiteAuditResult): WebsiteRebuildResult {
  const copy = localeCopy[lang(language)]
  const brand = brandFromUrl(sourceUrl)
  const weakScores = audit ? [audit.performance, audit.mobile, audit.seo, audit.conversion].filter(score => score < 60).length : 1
  const recommended = !audit || weakScores > 0 || audit.recommendations.some(item => item.priority === 'high')
  const pages = [
    { slug: 'home', title: copy.home, sections: ['hero', 'proof', 'features', 'testimonials', 'faq', 'final_cta'] },
    { slug: 'about', title: copy.about, sections: ['mission', 'story', 'team', 'values'] },
    { slug: 'services', title: copy.services, sections: ['service_grid', 'process', 'outcomes'] },
    { slug: 'pricing', title: copy.pricing, sections: ['plans', 'comparison', 'guarantee'] },
    { slug: 'contact', title: copy.contact, sections: ['contact_form', 'booking', 'locations'] },
  ]
  const content = Object.fromEntries(pages.map(page => [page.slug, Object.fromEntries(page.sections.map(section => [section, { headline: `${page.title}: ${section.replace(/_/g, ' ')} for ${brand}`, body: `${brand} presents a modern ${businessType} experience focused on clear value, trust proof, fast mobile paths, and accessible conversion steps.`, cta: copy.cta }]))])) as WebsiteRebuildResult['content']
  const seo = Object.fromEntries(pages.map(page => [page.slug, { title: `${brand} ${page.title} | Modern ${businessType} website`, description: `${brand} ${page.title.toLowerCase()} page designed for faster decisions, stronger trust, multilingual SEO, and measurable conversion.` }]))
  const reason = audit ? `Rebuild recommended from audit scores: performance ${audit.performance}, mobile ${audit.mobile}, SEO ${audit.seo}, conversion ${audit.conversion}.` : copy.reason
  return safe({ recommended, reason: recommended ? reason : 'A full rebuild is optional; targeted optimization can address the remaining issues.', structure: { pages }, content, seo })
}

export async function generateWebsiteRebuild(input: { source_url: string; business_type?: string; language?: string; audit?: WebsiteAuditResult }): Promise<WebsiteRebuildResult> {
  const audit = input.audit || await analyzeWebsite(input.source_url).catch(() => emptyAuditForUrl(input.source_url))
  const fallback = deterministicRebuild(input.source_url, input.language || 'en', input.business_type, audit)
  if (!process.env.OPENAI_API_KEY) return fallback
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.35,
      messages: [
        { role: 'system', content: 'Return only JSON matching {"recommended":true,"reason":"","structure":{"pages":[{"slug":"home","title":"Home","sections":[]}]},"content":{"home":{}},"seo":{"home":{"title":"","description":""}}}. No markdown.' },
        { role: 'user', content: JSON.stringify({ task: 'Generate a production-ready modern website rebuild plan and multilingual copy.', input, audit }) },
      ],
    })
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}')
    if (!parsed.structure?.pages || !parsed.content || !parsed.seo) return fallback
    return safe({ recommended: Boolean(parsed.recommended), reason: String(parsed.reason || fallback.reason), structure: parsed.structure, content: parsed.content, seo: parsed.seo })
  } catch { return fallback }
}
