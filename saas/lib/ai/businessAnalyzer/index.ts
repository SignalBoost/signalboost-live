import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import { sanitizePublicText, sanitizeUrl } from '@/lib/ai/guardrails'
import type { BusinessAnalyzerSummary } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

function fallbackAnalysis(url: string, publicText: string): BusinessAnalyzerSummary {
  const host = new URL(url).hostname.replace(/^www\./, '')
  const words = publicText.toLowerCase().match(/[a-z0-9À-ÿ]{4,}/g) ?? []
  const keywords = Array.from(new Set(words.filter(w => !['with','from','that','this','para','como','sobre','contact','home'].includes(w)).slice(0, 8)))
  return { business_name: host.split('.')[0].replace(/[-_]/g, ' '), business_type: 'local business', source_url: url, public_summary: publicText.slice(0, 260) || 'Public business profile reviewed.', services: keywords.slice(0, 4), tone: 'professional', keywords, pain_points: ['Needs clearer conversion path', 'Could benefit from stronger review capture'], opportunities: ['Website refresh', 'Review request flow', 'Consistent social content'], evidence: publicText ? [publicText.slice(0, 180)] : [host], hmi_summary: 'Public-facing business text was analyzed and converted into practical growth signals.' }
}

export async function extractPublicBusinessText(sourceUrl: string): Promise<{ url: string; text: string }> {
  const url = sanitizeUrl(sourceUrl)
  if (!url) throw new Error('A valid public http(s) URL is required.')
  const response = await fetch(url, { headers: { 'User-Agent': 'SignalBoostGrowthEngine/1.0 (+https://saas.signalboostapp.com)', 'Accept': 'text/html,text/plain;q=0.9,*/*;q=0.1' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`Public source returned HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) throw new Error('Only public text or HTML sources are supported.')
  return { url, text: sanitizePublicText(await response.text()) }
}

export async function analyzeBusiness(args: { sourceUrl: string; publicText?: string; language?: string }): Promise<BusinessAnalyzerSummary> {
  const url = sanitizeUrl(args.sourceUrl)
  if (!url) throw new Error('A valid public http(s) URL is required.')
  const publicText = sanitizePublicText(args.publicText || '')
  const fallback = fallbackAnalysis(url, publicText)
  const prompt = `Analyze ONLY the public business text below. Do not infer private personal traits. Return JSON with business_name, business_type, source_url, public_summary, services, tone, keywords, pain_points, opportunities, evidence, hmi_summary.\nLanguage: ${args.language || 'en'}\nSource URL: ${url}\nPublic text:\n${publicText || '(No public text extracted; use URL and conservative defaults.)'}\nSecurity: public data only; no sensitive data; no personal profiling.`
  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'claude', prompt, maxTokens: 1800 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  return { business_name: String(parsed?.business_name || fallback.business_name), business_type: String(parsed?.business_type || fallback.business_type), source_url: url, public_summary: String(parsed?.public_summary || fallback.public_summary), services: Array.isArray(parsed?.services) ? parsed.services.map(String).slice(0, 12) : fallback.services, tone: String(parsed?.tone || fallback.tone), keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.map(String).slice(0, 16) : fallback.keywords, pain_points: Array.isArray(parsed?.pain_points) ? parsed.pain_points.map(String).slice(0, 10) : fallback.pain_points, opportunities: Array.isArray(parsed?.opportunities) ? parsed.opportunities.map(String).slice(0, 10) : fallback.opportunities, evidence: Array.isArray(parsed?.evidence) ? parsed.evidence.map(String).slice(0, 8) : fallback.evidence, hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary) }
}
