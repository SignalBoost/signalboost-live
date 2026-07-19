// saas/app/api/hub/audit/executive-summary/route.ts
// Executive Risk Summary — owner-gated JSON.
// Deterministic score/risks always returned; LLM narrative is best-effort.
// Persisted finding-state rows are overlaid before scoring so handled findings
// do not keep appearing as active remediation work.
//
// Cost controls:
//   • Prompt caching — the static system prefix (analyst instruction + sanitized
//     environment context) is sent as an ephemeral-cacheable block, so repeat
//     calls pay the cheap cache-read rate on it.
//   • Usage metering — every call's token counts + estimated cost are logged to
//     the user_audit_usage ledger via lib/ai/usage.ts (resilient; never blocks).

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getReportSnapshot } from '@/lib/audit/snapshotCache'
import { getAdminSupabase } from '@/utils/supabase/server'
import { buildExecutiveSummary, execSummaryFacts } from '@/lib/audit/execSummary'
import { processAuditSnapshot } from '@/lib/audit/processor'
import { indexStates, type FindingStateRow } from '@/lib/audit/findingState'
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
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }
  const userId =
    (guard as any).ctx?.userId ?? (guard as any).ctx?.user?.id ?? (guard as any).ctx?.id ?? null

  try {
    const lang = normalizeLang(new URL(req.url).searchParams.get('lang'))
    const db = getAdminSupabase()
    const snapshot = await getReportSnapshot(db)

    // Triage-state loading is best-effort. A missing optional table must not make
    // the report unavailable, but valid stored state must be respected when present.
    let states = {}
    try {
      const { data, error } = await (db as any)
        .from('audit_finding_state')
        .select('finding_id,status,owner,note,due_date,updated_at,updated_by')
      if (!error && Array.isArray(data)) states = indexStates(data as FindingStateRow[])
    } catch { /* summary remains available without the optional overlay */ }

    const summary = buildExecutiveSummary(snapshot, { states })

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

    // Deep, code-aware narrative produced by the post-scan synthesis pass and
    // cached on the snapshot (best-effort; empty until the first run completes).
    const deepReport = ((snapshot as any).narrative as string) || ''
    return NextResponse.json({ ok: true, report: { ...summary, narrative, deepReport } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build executive summary.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
