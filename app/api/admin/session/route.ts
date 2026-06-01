import { NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/admin/adminAccess'

export async function GET() {
  const session = await getCurrentAdminSession()
  return NextResponse.json(session)
}
