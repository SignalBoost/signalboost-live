import { NextRequest, NextResponse } from 'next/server'
import { customerSession, rpcErrorCode } from '@/lib/lab/customerSession'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const name = typeof body?.organizationName === 'string' ? body.organizationName.trim() : ''
  if (!name || name.length > 120) return NextResponse.json({ ok: false, error: 'lab_customer_workspace_name_invalid' }, { status: 400 })
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_initialize_workspace', { p_name: name })
  if (error || !data) return NextResponse.json({ ok: false, error: rpcErrorCode(error) }, { status: 503 })
  return NextResponse.json({ ok: true, workspace: data }, { headers: { 'cache-control': 'no-store' } })
}
