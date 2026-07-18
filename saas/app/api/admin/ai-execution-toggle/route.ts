import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_ID = 'global'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const { data, error } = await getAdminSupabase()
    .from('system_status')
    .select('ai_autonomous_execution_enabled, updated_at')
    .eq('id', STATUS_ID)
    .single()

  if (error || !data) return NextResponse.json({ ok: false, error: 'Global AI status is unavailable.' }, { status: 503 })
  return NextResponse.json({ ok: true, ...data })
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  let body: { enabled?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 }) }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ ok: false, error: '`enabled` must be a boolean.' }, { status: 400 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('system_status')
    .update({ ai_autonomous_execution_enabled: body.enabled, updated_by: guard.ctx.userId })
    .eq('id', STATUS_ID)
    .select('ai_autonomous_execution_enabled, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ ok: false, error: 'Unable to update global AI status.' }, { status: 503 })
  try {
    await admin.from('admin_audit_log').insert({
      actor_id: guard.ctx.userId,
      action: body.enabled ? 'global_ai_autonomy_restored' : 'global_ai_kill_switch_engaged',
      target_type: 'system_status',
      target_id: STATUS_ID,
      metadata: { ai_autonomous_execution_enabled: body.enabled },
    })
  } catch {
    // The flag update is authoritative; audit-table availability must not prevent an emergency stop.
  }

  return NextResponse.json({ ok: true, ...data })
}
