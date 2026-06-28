// saas/app/api/cos/run/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// The "Run" endpoint — hands-free execution of a compiled spec.
//
// This route now builds a COS reasoning context before delegating to the proven
// support executor. That context carries mined / external signals, the marketing
// decision engine output, and the hybrid reasoning rule: LLM for analogical
// strategy, scoring engine for validation.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { buildCosReasoningBridge } from '@/lib/cos/reasoning-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const reply = (ok: boolean, text: string, error?: string, status = 200) =>
  NextResponse.json({ ok, text, timedOut: false, ...(error ? { error } : {}) }, { status })

export async function POST(req: Request) {
  const user = await getCurrentUser(req as any)
  if (!user) return reply(false, '', 'Unauthorized', 401)
  if (user.role !== 'owner') return reply(false, '', 'Forbidden — COS execution is owner-only.', 403)

  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return reply(false, '', 'text (compiled spec) is required', 400)

  const surface = typeof body?.surface === 'string' ? body.surface : 'cos'
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : ''
  const locale = (req.headers.get('x-locale') || 'en').slice(0, 5)

  const reasoning = buildCosReasoningBridge({
    user_text: text,
    surface,
    external_signals: Array.isArray(body?.external_signals) ? body.external_signals : undefined,
  })

  const enrichedText = [
    reasoning.formatted_context,
    '',
    'OWNER REQUEST / COMPILED SPEC',
    text,
    '',
    'EXECUTION INSTRUCTION',
    'Use the COS reasoning context above before answering or executing. Do not ask the owner to choose marketing strategy when COSA can decide from signals. Human approval remains required for release, posting, paid distribution, spending, or external outreach.',
  ].join('\n')

  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') || ''

  try {
    const res = await fetch(`${origin}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        messages: [{ role: 'user', content: enrichedText }],
        executeMode: true,
        context: { language: locale, currentPage: surface, conversationId, cosReasoningId: reasoning.id },
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return reply(false, '', data?.error || `Executor failed (${res.status})`, 502)
    }
    return reply(true, typeof data.reply === 'string' ? data.reply : '')
  } catch (err: any) {
    return reply(false, '', err?.message || 'COS run failed', 500)
  }
}
