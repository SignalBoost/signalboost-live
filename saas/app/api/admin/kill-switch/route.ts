import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { data, error } = await getAdminSupabase()
    .from('system_status')
    .select('ai_autonomous_execution_enabled, updated_at')
    .eq('id', 'global')
    .single()

  if (error) return NextResponse.json({ error: 'Unable to read global AI execution status.' }, { status: 500 })
  return NextResponse.json({ enabled: data.ai_autonomous_execution_enabled, updatedAt: data.updated_at })
}

export async function POST() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { error } = await getAdminSupabase()
    .from('system_status')
    .update({ ai_autonomous_execution_enabled: false, updated_at: new Date().toISOString(), updated_by: guard.ctx.userId })
    .eq('id', 'global')

  if (error) return NextResponse.json({ error: 'Unable to engage the global AI kill switch.' }, { status: 500 })
  return NextResponse.json({ ok: true, enabled: false })
}
