import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { isContentGenerationRequest } from '@/lib/ai/cos/contentGenerationIntent'
import { isReadOnlyKnowledgePrompt } from '@/lib/ai/cos/adaptiveResearchPolicy'
import { getExternalInfo, type SearchResult } from '@/lib/ai/tools/getExternalInfo'
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const SYNTHESIS_TIMEOUT_MS = 20_000
const MAX_QUERY_CHARS = 600

function latestUserText(body: any): string {
  if (typeof body?.query === 'string' && body.query.trim()) return body.query.trim()
  if (typeof body?.input === 'string' && body.input.trim()) return body.input.trim()
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const content = messages[index]?.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    if (Array.isArray(content)) {
      const value = content.map((block: any) => String(block?.text || '')).join('\n').trim()
      if (value) return value
    }
  }
  return ''
}

function languageCode(value: unknown): 'en' | 'es' | 'pt' | 'pl' | 'ru' {
  const code = String(value || 'en').trim().toLowerCase().slice(0, 2)
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}

function languageName(code: ReturnType<typeof languageCode>): string {
  return code === 'es' ? 'Spanish' : code === 'pt' ? 'Portuguese' : code === 'pl' ? 'Polish' : code === 'ru' ? 'Russian' : 'English'
}

function sourceBlock(results: SearchResult[]): string {
  return results.slice(0, 6).map((result, index) => [
    `[${index + 1}] ${result.title}`,
    `URL: ${result.url}`,
    `EXCERPT: ${result.snippet}`,
  ].join('\n')).join('\n\n')
}

function sourceList(results: SearchResult[]): string {
  return results.slice(0, 4).map((result, index) => `[${index + 1}] ${result.title} — ${result.url}`).join('\n')
}

function extractiveFallback(results: SearchResult[], language: ReturnType<typeof languageCode>): string {
  const strongest = results.slice(0, 3)
  const intro = language === 'es'
    ? 'COS buscó fuentes externas porque la respuesta local no fue suficiente. La evidencia más relevante recuperada es:'
    : language === 'pt'
      ? 'O COS pesquisou fontes externas porque a resposta local não foi suficiente. A evidência recuperada mais relevante é:'
      : language === 'pl'
        ? 'COS przeszukał źródła zewnętrzne, ponieważ odpowiedź lokalna nie była wystarczająca. Najbardziej istotne znalezione informacje to:'
        : language === 'ru'
          ? 'COS выполнил поиск по внешним источникам, потому что локального ответа было недостаточно. Наиболее релевантные найденные сведения:'
          : 'COS searched external sources because the local answer was not sufficient. The strongest retrieved evidence is:'
  return [
    intro,
    ...strongest.map((result, index) => `${index + 1}. ${result.title}: ${result.snippet}\n${result.url}`),
  ].join('\n\n')
}

function parseSynthesis(raw: string | null): { answer: string; confidence: number } | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as { answer?: unknown; confidence?: unknown }
    const answer = String(parsed.answer ?? '').trim()
    const confidence = Number(parsed.confidence)
    if (!answer) return null
    return {
      answer,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.65,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, source: 'adaptive_research_auth' }, { status: guard.status })

  const body = await req.json().catch(() => null)
  const query = latestUserText(body).slice(0, MAX_QUERY_CHARS)
  const language = languageCode(body?.language ?? body?.context?.language)

  // This lane is intentionally read-only. It is a knowledge-recovery path, never an action replay.
  if (!isReadOnlyKnowledgePrompt(query) || isContentGenerationRequest(query)) {
    return NextResponse.json({
      ok: false,
      source: 'adaptive_research_not_eligible',
      error: 'Automatic research is limited to concise read-only knowledge questions.',
    }, { status: 409 })
  }

  const search = await getExternalInfo(query, 6, { bypassCache: false })
  if (!search.ok || !search.results.length) {
    console.warn('[cos-adaptive-research]', JSON.stringify({
      elapsedMs: Date.now() - startedAt,
      searched: true,
      results: 0,
      synthesized: false,
      error: search.error || 'no_results',
    }))
    return NextResponse.json({
      ok: false,
      source: 'adaptive_research_no_evidence',
      error: 'External-source research did not return usable evidence.',
    }, { status: 503 })
  }

  const evidence = sourceBlock(search.results)
  let synthesis: { answer: string; confidence: number } | null = null
  let reasonerLabel: string | null = null

  try {
    const configured = localInferenceConfigFromEnv()
    reasonerLabel = configured.model
    const raw = await callLocalModel({
      temperature: 0.1,
      maxTokens: 1200,
      jsonObject: true,
      systemPrompt: [
        'You are COS performing bounded adaptive research after an ordinary knowledge answer was unavailable.',
        'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
        'Answer the user question directly from the supplied external-source evidence. Do not invent facts, UI steps, dates, names, settings, or capabilities that the evidence does not support.',
        'Prefer the owning/first-party source when it is present. If evidence conflicts or is incomplete, say exactly what remains uncertain.',
        'Keep the answer concise for a simple question and more detailed only when the question requires it.',
        `Write in ${languageName(language)}.`,
        'Include bracket source numbers such as [1] next to material claims. Never claim that you changed or executed anything; this route is read-only research.',
      ].join(' '),
      prompt: `USER QUESTION:\n${query}\n\nEXTERNAL EVIDENCE:\n${evidence}`,
    }, {
      ...configured,
      timeoutMs: Math.min(configured.timeoutMs, SYNTHESIS_TIMEOUT_MS),
    })
    synthesis = parseSynthesis(raw)
  } catch (error) {
    console.warn('[cos-adaptive-research-synthesis-failed]', error instanceof Error ? error.message : String(error))
  }

  const reply = synthesis
    ? `${synthesis.answer}\n\nSources:\n${sourceList(search.results)}`
    : extractiveFallback(search.results, language)

  console.info('[cos-adaptive-research]', JSON.stringify({
    elapsedMs: Date.now() - startedAt,
    searched: true,
    results: search.results.length,
    synthesized: Boolean(synthesis),
    reasonerLabel,
  }))

  return NextResponse.json({
    ok: true,
    reply,
    content: reply,
    source: 'adaptive_web_research',
    confidence: synthesis?.confidence ?? 0.52,
    external_ai_invoked: false,
    autonomous_research_attempted: true,
    research_documents_acquired: search.results.length,
    reasoner_label: reasonerLabel,
    evidence: search.results.slice(0, 6).map((result, index) => ({
      id: `WEB${index + 1}`,
      title: result.title,
      url: result.url,
      authority_tier: result.authorityTier ?? null,
    })),
  })
}
