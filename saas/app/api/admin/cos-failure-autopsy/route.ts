import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readFailureAutopsyReport, runNextFailureAutopsyRetest } from '@/lib/ai/cos/turnFailureAutopsy'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'

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

  try {
    await ensureLocalInferenceRuntimeReady().catch(error => {
      console.warn('[cos-failure-autopsy-retest] readiness warning:', error instanceof Error ? error.message : String(error))
    })
    const probe = await probeReasoner({ completionTimeoutMs: RETEST_PROBE_TIMEOUT_MS })
    if (probe.verdict !== 'ok') {
      const result = {
        ok: false as const,
        blocked: true,
        verdict: probe.verdict,
        error: `Reasoner unavailable (${probe.verdict}) — no autopsy retest was scored. ${probe.summary}`,
      }
      return NextResponse.json(result, { status: 503 })
    }
    const result = await runNextFailureAutopsyRetest()
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
