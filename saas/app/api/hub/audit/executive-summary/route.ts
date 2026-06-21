// saas/app/api/hub/audit/executive-summary/route.ts
// Executive Risk Summary — owner-gated JSON.
// Deterministic score/risks always returned; LLM narrative is best-effort.
//
// Cost controls:
//   • Prompt caching — the static system prefix (analyst instruction + sanitized
//     environment context) is sent as an ephemeral-cacheable block, so repeat
//     calls pay the cheap cache-read rate on it.
//   • Usage metering — every call's token counts + estimated cost are logged to
//     the user_audit_usage ledger via lib/ai/usage.ts (resilient; never blocks).

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildExecutiveSummary, execSummaryFacts } from '@/lib/audit/execSummary'
import { processAuditSnapshot } from '@/lib/audit/processor'
import { cachedSystem, recordUsage, type TokenUsage } from '@/lib/ai/usage'

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

interface NarrateResult { text: string | null; usage: TokenUsage | null }

/** Best-effort narrative + token usage. Returns nulls on any failure — never throws. */
async function narrate(factBlock: string, sanitizedContext: string, lang: string): Promise<NarrateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { text: null, usage: null }
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const language = LANGUAGE_NAME[lang] || 'English'

    // Static, cacheable prefix: instruction + sanitized context (secrets masked).
    const systemText =
      `You are a security readiness analyst preparing a B2B operational readiness assessment. ` +
      `Write a concise executive summary in ${language}, 2-3 short paragraphs, plain and professional. ` +
      `Use ONLY the facts provided — never invent findings, numbers, or providers. ` +
      `Describe readiness and risk; do NOT claim any certification (no "SOC 2 certified", no "compliant"). ` +
      `Lead with the overall posture, then the most important risks, then the gaps that need evidence.\n\n` +
      `Sanitized environment context (secrets already masked):\n${sanitizedContext.slice(0, 4000)}`

    const resp = await client.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: 900,
      system: cachedSystem(systemText) as any, // ephemeral prompt cache on the static prefix
      messages: [{ role: 'user', content: `Deterministic facts:\n${factBlock}` }],
    })

    const text = Array.isArray(resp?.content)
      ? resp.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('').trim()
      : ''
    return { text: text || null, usage: (resp?.usage as TokenUsage) || null }
  } catch {
    return { text: null, usage: null }
  }
}

export async function GET(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }
  const userId =
    (guard as any).ctx?.userId ?? (guard as any).ctx?.user?.id ?? (guard as any).ctx?.id ?? null

  try {
    const lang = normalizeLang(new URL(req.url).searchParams.get('lang'))
    const snapshot = await collectSnapshot()
    const summary = buildExecutiveSummary(snapshot)

    let sanitizedContext = ''
    try {
      const processed = processAuditSnapshot(snapshot as any)
      if (processed.ok) sanitizedContext = processed.systemPrompt
    } catch { /* sanitization optional */ }

    const { text: narrative, usage } = await narrate(execSummaryFacts(summary), sanitizedContext, lang)

    // Meter the call (best-effort; does not block the response).
    if (usage) {
      void recordUsage({ userId, feature: 'audit.executive-summary', model: NARRATIVE_MODEL, usage })
    }

    return NextResponse.json({ ok: true, report: { ...summary, narrative } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build executive summary.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
