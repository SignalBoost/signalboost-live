import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readFailureAutopsyReport, runNextFailureAutopsyRetest } from '@/lib/ai/cos/turnFailureAutopsy'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RETEST_PROBE_TIMEOUT_MS = 90_000

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const result = await readFailureAutopsyReport(50)
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const wakePermission: RunpodWakePermission = {
    allowed: true,
    source: 'user_interactive',
    interactionId: null,
    issuedAtMs: null,
    ageMs: null,
    reason: 'owner_authenticated_failure_autopsy_retest',
  }

  try {
    const result = await withRunpodWakePermission(wakePermission, async () => {
      await ensureLocalInferenceRuntimeReady().catch(error => {
        console.warn('[cos-failure-autopsy-retest] readiness warning:', error instanceof Error ? error.message : String(error))
      })
      const probe = await probeReasoner({ completionTimeoutMs: RETEST_PROBE_TIMEOUT_MS })
      if (probe.verdict !== 'ok') {
        return {
          ok: false as const,
          blocked: true,
          verdict: probe.verdict,
          error: `Reasoner unavailable (${probe.verdict}) — no autopsy retest was scored. ${probe.summary}`,
        }
      }
      return runNextFailureAutopsyRetest()
    })
    return NextResponse.json(result, { status: result.ok ? 200 : ('blocked' in result && result.blocked ? 503 : 409) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
