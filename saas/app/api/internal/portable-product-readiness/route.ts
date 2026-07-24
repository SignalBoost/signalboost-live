import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { portableProductReadinessDashboard } from '@/lib/portable-products'

/** Internal, read-only metadata readiness inspection endpoint. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(portableProductReadinessDashboard)
}
