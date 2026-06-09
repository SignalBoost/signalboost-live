import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export async function GET() {
  const ctx = await getAccess()
  return NextResponse.json({ isAdmin: ctx.isAdmin, isOwner: ctx.isOwner, role: ctx.role })
}
