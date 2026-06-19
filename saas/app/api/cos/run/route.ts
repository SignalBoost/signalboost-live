// saas/app/api/cos/run/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// The "Run" endpoint — hands-free execution of a compiled spec.
//
// HONEST IMPLEMENTATION NOTE: the COS gateway in lib/cos/ is scaffolding whose
// engine/tool/prompt registries do not exist yet. Rather than stand up a parallel
// (and inevitably drifting) Anthropic engine + tool stack there, this route hands
// the compiled spec to the proven executor that already does all of it — the
// chief-of-staff pipeline in /api/support — running it in EXECUTE MODE.
//
// Safety posture (unchanged from what the owner already runs):
//   • OWNER ONLY. Admins are read/diagnose; only the owner can execute.
//   • The executor commits to ai/* preview branches, NEVER main.
//   • The owner still merges. Hands-free = auto-commit-to-branch, not auto-deploy.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const reply = (ok: boolean, text: string, error?: string, status = 200) =>
  NextResponse.json({ ok, text, timedOut: false, ...(error ? { error } : {}) }, { status })

export async function POST(req: Request) {
  // Principal resolved server-side; execution is owner-only.
  const user = await getCurrentUser(req as any)
  if (!user) return reply(false, '', 'Unauthorized', 401)
  if (user.role !== 'owner') return reply(false, '', 'Forbidden — COS execution is owner-only.', 403)

  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return reply(false, '', 'text (compiled spec) is required', 400)

  const surface = typeof body?.surface === 'string' ? body.surface : 'cos'
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : ''
  const locale = (req.headers.get('x-locale') || 'en').slice(0, 5)

  // Delegate to the proven executor in execute mode, forwarding the owner's session.
  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') || ''

  try {
    const res = await fetch(`${origin}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        executeMode: true,
        context: { language: locale, currentPage: surface, conversationId },
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
