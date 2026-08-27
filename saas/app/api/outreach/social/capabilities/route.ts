// saas/app/api/outreach/social/capabilities/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { loadSocialCapabilityInventory } from '@/lib/outreach/social-capability-inventory.ts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const inventory = await loadSocialCapabilityInventory({
    admin: ctx.admin,
    userId: ctx.user.id,
  })

  return NextResponse.json({ ok: true, ...inventory })
}
