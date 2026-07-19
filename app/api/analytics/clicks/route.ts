import { getClicksAnalytics } from '@/lib/analytics/outreach'
import { secureAnalyticsRoute } from '@/lib/analytics/route'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return secureAnalyticsRoute(request, getClicksAnalytics)
}
