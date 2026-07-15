// saas/app/api/agency/render-credits/route.ts
// Returns the signed-in user's render-credit balance for the agency UI.
// GET -> { signedIn, balance }

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getRenderBalance } from '@/lib/credits/renderCredits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ signedIn: false, balance: 0 })
  const balance = await getRenderBalance(access.userId)
  return NextResponse.json({ signedIn: true, balance })
}
