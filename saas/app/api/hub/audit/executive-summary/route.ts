// saas/app/api/hub/audit/executive-summary/route.ts
// Executive Risk Summary — owner-gated JSON.
// Collects a full cross-provider snapshot, builds the DETERMINISTIC summary
// (score, severity breakdown, top risks), then attempts an LLM narrative.
//
// The narrative is best-effort: if ANTHROPIC_API_KEY is missing or the model
// call fails for any reason, the deterministic report is still returned with
// narrative: null. The LLM never invents findings — it only writes prose over
// the deterministic fact block, and the sanitized context (no secrets) is built
// by lib/audit/processor.ts before anything leaves the server.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildExecutiveSummary, execSummaryFacts } from '@/lib/audit/execSummary'
import { processAuditSnapshot } from '@/lib/audit/processor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const NARRATIVE_MODEL = process.env.AUDIT_NARRATIVE_MODEL || 'claude-sonnet-4-6'

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian',
}

function normalizeLang(value: string | null): string {
  const l = (value || 'en').toLowerCase().slice(0, 2)
  return LANGUAGE_NAME[l] ? l : 'en'
}

/** Best-effort LLM narrative. Returns null on any failure — never throws. */
async function narrate(factBlock: string, sanitizedContext: string, lang: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })

    const language = LANGUAGE_NAME[lang] || 'English'
    const system =
      `You are a security readiness analyst preparing a B2B operational readiness assessment. ` +
      `Write a concise executive summary in ${language}, 2-3 short paragraphs, plain and professional. ` +
      `Use ONLY the facts provided — never invent findings, numbers, or providers. ` +
      `Describe readiness and risk; do NOT claim any certification (no "SOC 2 certified", no "compliant"). ` +
      `Lead with the overall posture, then the most important risks, then the gaps that need evidence.`

    const user =
      `Deterministic facts:\n${factBlock}\n\n` +
      `Sanitized environment context (secrets already masked):\n${sanitizedContext.slice(0, 4000)}`

    const resp = await client.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: 900,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const text = Array.isArray(resp?.content)
      ? resp.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('').trim()
      : ''
    return text || null
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  // Guard — owner only.
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const lang = normalizeLang(new URL(req.url).searchParams.get('lang'))

    // collectSnapshot() resolves to an AuditSnapshot directly (no wrapper).
    const snapshot = await collectSnapshot()

    // Deterministic core — always returned.
    const summary = buildExecutiveSummary(snapshot)

    // Sanitized context for the LLM (defense in depth — snapshot is already metadata-only).
    let sanitizedContext = ''
    try {
      const processed = processAuditSnapshot(snapshot as any)
      if (processed.ok) sanitizedContext = processed.systemPrompt
    } catch { /* sanitization optional for the narrative */ }

    // Best-effort narrative.
    const narrative = await narrate(execSummaryFacts(summary), sanitizedContext, lang)

    return NextResponse.json({ ok: true, report: { ...summary, narrative } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build executive summary.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
