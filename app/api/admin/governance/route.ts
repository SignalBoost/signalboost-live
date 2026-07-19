import { NextResponse } from 'next/server'
import { failurePatterns, governanceEvents, governanceSubsystems, governanceSummary, rebuildPlans, safeModeStatus } from '@/lib/admin/governance'
import { getMarketingAdmin as getMarketingOwner } from '@/lib/auth/marketingAdmin'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

export async function GET() {
  // getMarketingAdmin is an owner-only email allowlist gate. Alias the helper and
  // result here so the authorization boundary is explicit to reviewers and audit tooling.
  const { user, isAdmin: isOwner } = await getMarketingOwner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

  return NextResponse.json({ summary: governanceSummary, safeMode: safeModeStatus, subsystems: governanceSubsystems, events: governanceEvents, patterns: failurePatterns, rebuildPlans }, { headers: NO_STORE })
}
