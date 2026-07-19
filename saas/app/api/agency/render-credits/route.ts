// saas/app/api/agency/render-credits/route.ts
// Returns the signed-in user's render-credit state for the agency UI.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getRenderBalance, hasUnlimitedRenderCredits } from '@/lib/credits/renderCredits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ signedIn: false, balance: 0, unlimited: false, isOwner: false })

  if (access.isOwner || await hasUnlimitedRenderCredits(access.userId)) {
    return NextResponse.json({ signedIn: true, balance: null, unlimited: true, isOwner: true })
  }

  const balance = await getRenderBalance(access.userId)
  return NextResponse.json({ signedIn: true, balance, unlimited: false, isOwner: false })
}
