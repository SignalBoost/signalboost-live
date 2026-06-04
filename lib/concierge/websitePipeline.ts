import { analyzeWebsite } from '@/lib/websites/analyzer'
import { optimizeWebsiteContent } from '@/lib/websites/optimizer'
import { generateWebsiteRebuild } from '@/lib/websites/rebuild'
import { getLatestWebsiteAudit, persistConciergeIntent, persistWebsiteAudit, persistWebsiteRebuild } from '@/lib/websites/storage'

export type ConciergeIntent = 'calendar' | 'spreadsheets' | 'promote' | 'website_analyzer' | 'website_optimizer' | 'rebuild' | 'global_issue' | 'pricing' | 'modules' | 'support'
const supported = ['en', 'es', 'pt', 'pl', 'ru'] as const
export type ConciergeLanguage = typeof supported[number]
const translations: Record<ConciergeLanguage, Record<string, string>> = {
  en: { missingUrl: 'Please send the website URL you want me to analyze.', analyzer: 'Website audit completed.', optimizer: 'Website optimizer draft is ready.', rebuild: 'Rebuild engine generated a modern site plan.', general: 'I can help with SignalBoost modules, pricing, websites, and global business issues.' },
  es: { missingUrl: 'Envíame la URL del sitio que quieres analizar.', analyzer: 'Auditoría del sitio completada.', optimizer: 'El borrador del optimizador está listo.', rebuild: 'El motor de reconstrucción generó un plan moderno.', general: 'Puedo ayudar con módulos, precios, sitios web y temas globales.' },
  pt: { missingUrl: 'Envie a URL do site que você quer analisar.', analyzer: 'Auditoria do site concluída.', optimizer: 'O rascunho do otimizador está pronto.', rebuild: 'O motor de reconstrução gerou um plano moderno.', general: 'Posso ajudar com módulos, preços, sites e questões globais.' },
  pl: { missingUrl: 'Podaj adres URL strony, którą mam przeanalizować.', analyzer: 'Audyt strony zakończony.', optimizer: 'Szkic optymalizacji jest gotowy.', rebuild: 'Silnik przebudowy wygenerował nowy plan strony.', general: 'Pomogę z modułami, cenami, stronami i globalnymi tematami.' },
  ru: { missingUrl: 'Отправьте URL сайта, который нужно проанализировать.', analyzer: 'Аудит сайта завершен.', optimizer: 'Черновик оптимизации готов.', rebuild: 'Модуль перестройки создал современный план сайта.', general: 'Я помогу с модулями, ценами, сайтами и глобальными вопросами.' },
}
function normalizeLanguage(value?: string): ConciergeLanguage { const code = String(value || 'en').toLowerCase().slice(0,2); return supported.includes(code as ConciergeLanguage) ? code as ConciergeLanguage : 'en' }
function clean(input: string) { return input.normalize('NFKC').replace(/\s+/g, ' ').trim() }
function extractUrl(input: string) { return input.match(/https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/i)?.[0] || '' }
function classify(input: string): ConciergeIntent { const text = input.toLowerCase(); if (/rebuild|redesign|new (site|website)|reconstruct|modernize/.test(text)) return 'rebuild'; if (/optimi[sz]e|rewrite|improve.*(copy|content|seo|layout)|cta|headline/.test(text)) return 'website_optimizer'; if (/analy[sz]e|audit|score|seo|performance|accessibility|mobile.*site|security.*site|website/.test(text)) return 'website_analyzer'; if (/calendar|schedule/.test(text)) return 'calendar'; if (/spreadsheet|csv|sheet/.test(text)) return 'spreadsheets'; if (/promote|campaign|ad\b|marketing/.test(text)) return 'promote'; if (/price|plan|billing/.test(text)) return 'pricing'; if (/war|election|weather|news|global|worldwide|issue/.test(text)) return 'global_issue'; return 'modules' }
function sectionFrom(input: string) { return input.match(/\b(hero|about|pricing|footer|services|contact)\b/i)?.[1].toLowerCase() || 'hero' }

export async function runConciergePipeline(input: { rawInput: string; language?: string; accountId?: string | null }) {
  const language = normalizeLanguage(input.language)
  const cleaned_input = clean(input.rawInput)
  const intent = classify(cleaned_input)
  const url = extractUrl(cleaned_input)
  await persistConciergeIntent({ accountId: input.accountId, rawInput: input.rawInput, cleanedInput: cleaned_input, intent })
  const base = { language, cleaned_input, intent, internal_knowledge: ['SignalBoost includes Promote Business, Reviews, Calendar, Spreadsheets, Outreach, Personal Assistant, and Websites.'], external_context: intent === 'global_issue' ? 'Use configured LLM/web-search provider for current worldwide context before acting.' : null }
  if ((intent === 'website_analyzer' || intent === 'rebuild') && !url) return { ...base, reply: translations[language].missingUrl, action: 'request_url' }
  if (intent === 'website_analyzer') { const audit = await analyzeWebsite(url); const stored = await persistWebsiteAudit(input.accountId || null, audit); return { ...base, reply: translations[language].analyzer, action: 'show_website_analyzer', audit: { ...audit, audit_id: stored.auditId } } }
  if (intent === 'website_optimizer') { const optimized = await optimizeWebsiteContent({ url: url || 'https://signalboostapp.com', section: sectionFrom(cleaned_input), current_content: cleaned_input, language }); return { ...base, reply: translations[language].optimizer, action: 'show_website_optimizer', optimized } }
  if (intent === 'rebuild') { const rebuild = await generateWebsiteRebuild({ source_url: url, language }); const stored = await persistWebsiteRebuild(input.accountId || null, url, rebuild); return { ...base, reply: translations[language].rebuild, action: 'show_rebuild_engine', rebuild: { ...rebuild, rebuild_id: stored.rebuildId } } }
  const latestAudit = await getLatestWebsiteAudit(input.accountId || null)
  return { ...base, reply: translations[language].general, action: 'answer', latest_audit: latestAudit }
}
