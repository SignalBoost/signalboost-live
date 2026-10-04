// saas/app/api/admin/cos-university-settings/route.ts
//
// The University's own settings, read and changed from the University telemetry page. Owner, 2026-10-04: "any other
// settings/configuration regarding the portable should be with the University telemetry" - these are the buyer's
// knobs, so they live beside the buyer's line, not in the platform's admin settings.
//
// GET   -> the current view (stored value, what is effective after precedence, who changed it, when).
// PATCH -> `{ warmWindow?: string | null, linePaused?: boolean }`. Owner only. Each field is validated by the
//          settings module before it is stored; an invalid window is refused with 400 and nothing changes.
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  readLinePauseSetting,
  readWorkforceWarmWindowSetting,
  universitySettingsView,
  writeLinePauseSetting,
  writeWorkforceWarmWindowSetting,
} from '@/lib/ai/cos/cosUniversitySettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

async function currentView(db: ReturnType<typeof getAdminSupabase>) {
  const [warmWindow, linePause] = await Promise.all([readWorkforceWarmWindowSetting(db), readLinePauseSetting(db)])
  return universitySettingsView({ warmWindow, linePause, env: process.env, now: new Date() })
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  }
  try {
    const settings = await currentView(getAdminSupabase())
    return NextResponse.json({ ok: true, settings }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  }
  let body: Record<string, unknown> = {}
  try { body = (await req.json()) ?? {} } catch { body = {} }
  if (!body || typeof body !== 'object') body = {}
  const hasWarmWindow = Object.prototype.hasOwnProperty.call(body, 'warmWindow')
  const hasLinePaused = Object.prototype.hasOwnProperty.call(body, 'linePaused')
  if (!hasWarmWindow && !hasLinePaused) {
    return NextResponse.json({ ok: false, error: 'nothing_to_change' }, { status: 400, headers: NO_STORE })
  }
  if (hasLinePaused && typeof body.linePaused !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'line_paused_must_be_boolean' }, { status: 400, headers: NO_STORE })
  }

  try {
    const db = getAdminSupabase()
    const updatedBy = guard.ctx.userId
    const changed: string[] = []
    if (hasWarmWindow) {
      const written = await writeWorkforceWarmWindowSetting({ db, value: body.warmWindow, updatedBy })
      if (written.ok === false) return NextResponse.json({ ok: false, error: written.error }, { status: 400, headers: NO_STORE })
      changed.push('warmWindow')
    }
    if (hasLinePaused) {
      await writeLinePauseSetting({ db, paused: body.linePaused === true, updatedBy })
      changed.push('linePaused')
    }
    const settings = await currentView(db)
    return NextResponse.json({ ok: true, changed, settings }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/admin/cos-university-settings/route.ts (if this line is missing, the paste was cut short)
