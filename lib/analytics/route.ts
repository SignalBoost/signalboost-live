import { NextResponse } from 'next/server'
import { parseAnalyticsRequest, type AnalyticsFilters } from '@/lib/analytics/request'
import { getPlatformOperator } from '@/lib/auth/platformOperator'

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

export async function secureAnalyticsRoute<T>(
  request: Request,
  query: (filters: AnalyticsFilters) => Promise<T>,
) {
  const { user, isPlatformOperator } = await getPlatformOperator()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (!isPlatformOperator) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

  const parsed = parseAnalyticsRequest(request.url)
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })

  // These providers are configured for the platform account, never a caller-selected
  // organization. Restricting access to platform operators prevents cross-tenant reads.
  return NextResponse.json(await query(parsed.filters), { headers: NO_STORE })
}
