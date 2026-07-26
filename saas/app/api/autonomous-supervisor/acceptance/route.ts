// saas/app/api/autonomous-supervisor/acceptance/route.ts
//
// RUN THE ACCEPTANCE — the last item on the Self-Healing Supervisor's LIVE checklist, from
// the one place where the real wiring actually exists.
//
// WHY A ROUTE AND NOT JUST THE CLI. scripts/run-self-healing-acceptance.mjs proves the
// portable against a HostContext, and a buyer runs it in their own pipeline. But THIS
// platform's HostContext only resolves where its environment does — the mailer key, the owner
// addresses, the console URL live in the deployment, not on a laptop. Running the script
// locally exercises everything except the part that matters most: whether a paused step
// actually reaches a human here. This route closes that gap by running the same scenario
// where the wiring is real.
//
// WHAT IT DOES, precisely: constructs the platform HostContext, runs the acceptance scenario
// once per risk category, and returns the evidence record. It sends REAL notifications to the
// configured owner addresses — that is the point, not a side effect. Expect the emails.
//
// WHAT IT CANNOT DO: execute anything consequential. The scenario's dangerous step is required
// to pause; if it ever executed, the run reports FAILED and says not to deploy. There is no
// provider call, no repair, no state written. Safe to call repeatedly.
//
// Owner-only, matching the readiness route beside it: this reveals approver addresses and the
// health of the approval path.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { runAcceptanceScenario } from '@/lib/supervisor/portable'
import { createSignalBoostHostContext } from '@/self-healing-host/signalboost-host-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = ['financial', 'destructive', 'credential_security'] as const

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as any).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — running the acceptance scenario is owner-only' }, { status: 403 })
  }

  // POST, not GET, purely because this sends real email. Nothing here mutates state, but a
  // route that messages people should not be reachable by a link preview or a prefetch.

  let host
  try {
    host = createSignalBoostHostContext()
  } catch (error) {
    // The host context throws when no owner address is configured. That is a wiring answer,
    // not a server error, so report it as one the operator can act on.
    return NextResponse.json({
      ok: false,
      stage: 'host_context',
      error: error instanceof Error ? error.message : 'could not build the platform HostContext',
      remedy: 'Set OWNER_EMAILS (or OWNER_EMAIL) in the deployment environment, then run this again.',
    }, { status: 409 })
  }

  const url = new URL(req.url)
  const only = url.searchParams.get('category')
  if (only && !CATEGORIES.includes(only as never)) {
    return NextResponse.json({ ok: false, error: `unknown category "${only}"`, categories: CATEGORIES }, { status: 400 })
  }
  const categories = only ? [only as (typeof CATEGORIES)[number]] : [...CATEGORIES]

  const runs = []
  for (const dangerousCategory of categories) {
    const result = await runAcceptanceScenario({ host, dangerousCategory })
    // The full notification bodies carry approver addresses; the checks already report
    // delivery and routing, so the record keeps the verdicts and drops the payloads.
    runs.push({
      category: dangerousCategory,
      passed: result.passed,
      checks: result.checks,
      auditEventTypes: [...new Set(result.auditEvents.map(event => event.eventType))],
      notificationCount: result.notifications.length,
      summary: result.summary,
    })
  }

  const passed = runs.every(run => run.passed)
  const failed = runs.flatMap(run => run.checks.filter(check => !check.passed).map(check => `${run.category}: ${check.title} — ${check.detail}`))

  return NextResponse.json({
    ok: true,
    schemaVersion: 'self-healing-acceptance-record-v1',
    portable: 'self-healing-supervisor',
    ranAt: new Date().toISOString(),
    productName: host.branding?.productName ?? null,
    passed,
    categories,
    runs,
    blocking: failed,
    // Stated in the response so nobody has to remember it: a green run is the evidence that
    // closes item 7 of the integration guide, and the manifest stays preview until it exists.
    meaning: passed
      ? 'Every check passed against this deployment\'s real wiring. Keep this record — it is the acceptance evidence for item 7 of the integration guide.'
      : 'At least one check failed. The portable is not ready to be marked live on this deployment; each blocking item above names what to fix.',
  }, { status: passed ? 200 : 409 })
}
