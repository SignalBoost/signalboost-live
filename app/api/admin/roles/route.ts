import { NextResponse } from 'next/server'
import { createAdminSupabase, getCurrentAdminSession, listAdmins, normalizeAdminEmail } from '@/lib/admin/adminAccess'

function forbidden(message: string, status = 403) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET() {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return forbidden('Admin table membership is required.')

  return NextResponse.json({ success: true, admins: await listAdmins(), currentUser: session.user })
}

export async function POST(req: Request) {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return forbidden('Admin table membership is required.')
  if (!session.user?.is_primary) return forbidden('Only the primary admin can add admins.')

  const body = await req.json().catch(() => ({}))
  const email = normalizeAdminEmail(String(body.email || ''))
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 })
  }

  const supabase = createAdminSupabase()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured.' }, { status: 500 })

  const { error } = await supabase
    .from('admin')
    .upsert({ email, role: 'admin', is_primary: false }, { onConflict: 'email' })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, admins: await listAdmins() })
}

export async function DELETE(req: Request) {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return forbidden('Admin table membership is required.')
  if (!session.user?.is_primary) return forbidden('Only the primary admin can remove admins.')

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, error: 'Missing admin id.' }, { status: 400 })

  const supabase = createAdminSupabase()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured.' }, { status: 500 })

  const { data: target, error: readError } = await supabase
    .from('admin')
    .select('id,email,role,is_primary,created_at')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
  if (!target) return NextResponse.json({ success: false, error: 'Admin not found.' }, { status: 404 })
  if (target.is_primary) return forbidden('Primary admin cannot be removed.', 409)

  const { error } = await supabase.from('admin').delete().eq('id', id).eq('is_primary', false)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, admins: await listAdmins() })
}
