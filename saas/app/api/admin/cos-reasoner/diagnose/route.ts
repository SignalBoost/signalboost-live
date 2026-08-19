// saas/app/api/admin/cos-reasoner/diagnose/route.ts
//
// Owner-only. One click, one answer: WHY did COS return nothing?
//
// /api/admin/cos-reasoner/health answers "did the endpoint respond" and has been answering yes
// throughout this outage. This answers the three questions that actually distinguish the failures —
// reachable, has the configured model, and can produce a real completion — and reports the raw
// endpoint error text that callLocalModel() throws away.
//
// Read-only: one model-list GET and one 16-token generation. It optionally wakes the pod first,
// because probing a stopped pod would only ever report "unreachable".

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // ?wake=false probes exactly what a caller would hit without a wake, which is how the benchmark
  // behaved before the wake-permission fix. Default is to wake, matching the chat path.
  const wake = request.nextUrl.searchParams.get('wake') !== 'false'
  let wakeError: string | null = null

  const run = async () => {
    if (wake) {
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        // A wake failure is reported, never fatal: the probe below still records what the endpoint
        // does right now, and its result is the more specific evidence.
        wakeError = error instanceof Error ? error.message : String(error)
      }
    }
    return probeReasoner()
  }

  const result = wake
    ? await withRunpodWakePermission(
        {
          allowed: true,
          // An owner hitting this endpoint in a browser is the same trust class as an interactive
          // chat turn, which is what the wake gate exists to admit.
          source: 'user_interactive',
          interactionId: null,
          issuedAtMs: Date.now(),
          ageMs: 0,
          reason: 'owner-initiated reasoner diagnosis',
        },
        run,
      )
    : await run()

  return NextResponse.json(
    { ok: result.verdict === 'ok', wakeAttempted: wake, wakeError, ...result },
    { status: result.verdict === 'ok' ? 200 : 503 },
  )
}
