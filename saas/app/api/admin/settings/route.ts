import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// The system flags this page manages. Add to this list to expose more controls.
const FLAGS = [
  { key: 'outreach_sending_disabled', label: 'Pause outreach sending', desc: 'Master kill-switch: when on, no outreach messages are sent.' },
  { key: 'signups_paused', label: 'Pause new signups', desc: 'When on, new account creation is discouraged in the UI.' },
  { key: 'maintenance_mode', label: 'Maintenance banner', desc: 'When on, you can show a maintenance notice to users.' },
] as const

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const admin = getAdminSupabase()
  const { data, error } = await admin.from('system_settings').select('key, value, updated_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byKey: Record<string, any> = {}
  for (const row of data || []) byKey[(row as any).key] = (row as any).value

  // Normalize each known flag to a boolean for the UI.
  const flags = FLAGS.map(f => {
    const raw = byKey[f.key]
    const on = raw === true || raw === 'true' || raw?.disabled === true
    return { key: f.key, label: f.label, desc: f.desc, on }
  })

  return NextResponse.json({ flags })
}

export async function PATCH(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const key = String(body?.key || '')
  const on = !!body?.on
  if (!FLAGS.some(f => f.key === key)) {
    return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const { error } = await admin
    .from('system_settings')
    .upsert(
      { key, value: on, updated_by: guard.ctx.userId, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key, on })
}
