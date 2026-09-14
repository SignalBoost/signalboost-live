import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  activateConfiguredGraduateRuntimeCanary,
  bindConfiguredGraduateRuntime,
  graduateRuntimeReadiness,
} from '@/lib/ai/cos/cosUniversityGraduateRuntime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status)
  return json({ ok: true, ...graduateRuntimeReadiness() })
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status)
  let body: any = null
  try { body = await request.json() } catch { body = null }
  try {
    const operation = String(body?.operation || '')
    if (operation === 'bind') {
      const result = await bindConfiguredGraduateRuntime()
      return json({ ok: true, ...result })
    }
    if (operation === 'activate_canary') {
      // This executes one tiny request against an already provisioned endpoint. Keep it behind an
      // explicit per-action owner confirmation even though model training itself is already complete.
      if (body?.confirmCanary !== true) {
        return json({ ok: false, error: 'graduate_runtime_explicit_canary_confirmation_required' }, 400)
      }
      const result = await activateConfiguredGraduateRuntimeCanary()
      return json({ ok: true, ...result })
    }
    return json({ ok: false, error: 'graduate_runtime_operation_invalid' }, 400)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400)
  }
}
