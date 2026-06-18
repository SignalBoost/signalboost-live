// saas/app/api/cos/run/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// The "Run" endpoint: receives a compiled spec from the Concierge UI and hands
// it to the COS gateway. This route is the boundary where the dumb client request
// becomes a fully-resolved TurnContext:
//   • Principal is resolved SERVER-SIDE from the session — never trusted from body.
//   • The compiled spec becomes the turn's user text.
//   • The gateway renders its own authoritative system prompt (doctrine included)
//     via its PromptStrategy — the client never ships a prompt.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import type {
  CosGateway, Principal, Role, Turn, TurnContext, RequestSignals, IntentKind,
} from '@/lib/cos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const VALID_MODES: IntentKind[] = ['execute', 'advise', 'mixed']

/** Map the hub role onto the COS principal role + privilege. */
function toPrincipal(user: { id: string; email: string; role: string }): Principal {
  const role: Role =
    user.role === 'owner' ? 'owner'
    : user.role === 'admin' ? 'admin'
    : user.role === 'operator' ? 'member'
    : 'guest'
  return {
    userId: user.id ?? null,
    email: user.email ?? null,
    role,
    privileged: role === 'owner' || role === 'admin',
  }
}

export async function POST(req: Request) {
  // 1. Principal — resolved from the verified session, never from the body.
  const user = await getCurrentUser(req as any)
  if (!user) {
    return NextResponse.json({ ok: false, text: '', timedOut: false, error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Read the dumb request.
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ ok: false, text: '', timedOut: false, error: 'text (compiled spec) is required' }, { status: 400 })
  }
  const surface = typeof body?.surface === 'string' ? body.surface : 'unknown'
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  const preferredMode: IntentKind | undefined =
    VALID_MODES.includes(body?.preferredMode) ? body.preferredMode : undefined

  // 3. Build the TurnContext the gateway consumes.
  const locale = (req.headers.get('x-locale') || 'en').slice(0, 5)
  const turn: Turn = {
    messages: [{ role: 'user', content: text }],
    latestUserText: text,
    locale,
    surface,
    conversationId,
  }
  const signals: RequestSignals = preferredMode ? { preferredMode } : {}
  const ctx: TurnContext = { principal: toPrincipal(user), turn, signals }

  // 4. Hand off to the gateway. The gateway picks intent → plan → engine, renders
  //    its own system prompt (doctrine), assembles context, and runs the tool loop.
  const gateway = getCosGateway()
  if (!gateway) {
    return NextResponse.json(
      { ok: false, text: '', timedOut: false, error: 'COS execution is not enabled yet.' },
      { status: 503 },
    )
  }

  try {
    const reply = await gateway.handle(ctx)
    return NextResponse.json({
      ok: reply.ok,
      text: reply.text,
      timedOut: reply.timedOut,
      ...(reply.error ? { error: reply.error } : {}),
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, text: '', timedOut: false, error: err?.message || 'COS run failed' },
      { status: 500 },
    )
  }
}

// ── Composition seam ─────────────────────────────────────────────────────────
// Returns the wired gateway, or null until the COS migration phase supplies the
// concrete engine / tool / prompt-strategy registries. The gateway scaffolding
// (DefaultCosGateway + HeuristicIntentRouter + DefaultPlanResolver + …) already
// composes; once the registries are registered, build the gateway here (or import
// it from a `@/lib/cos/compose` composition root) and return it. Returning null
// keeps the build green and the endpoint honest (503) until execution is enabled.
function getCosGateway(): CosGateway | null {
  return null
}
