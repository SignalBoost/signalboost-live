import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AppRole = 'user' | 'admin' | 'owner'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) throw new Error('Supabase admin env vars are not configured')

  return createClient(url, key)
}

export async function POST(req: Request) {
  try {
    const { actorUserId, actorEmail, targetUserId, targetEmail, oldRole } = await req.json()

    if (!actorUserId || !actorEmail || !targetUserId || !targetEmail) {
      return NextResponse.json({ error: 'Missing required payload fields' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { error: targetUpdateError } = await supabase.auth.admin.updateUserById(targetUserId, {
      user_metadata: { role: 'owner' satisfies AppRole },
    })
    if (targetUpdateError) throw targetUpdateError

    const { error: actorUpdateError } = await supabase.auth.admin.updateUserById(actorUserId, {
      user_metadata: { role: 'admin' satisfies AppRole },
    })
    if (actorUpdateError) throw actorUpdateError

    const { error: auditError } = await supabase.from('admin_role_audit_logs').insert({
      actor_email: actorEmail,
      target_email: targetEmail,
      old_role: oldRole ?? 'user',
      new_role: 'owner',
    })
    if (auditError) throw auditError

    return NextResponse.json({ success: true, message: 'Ownership transferred' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
