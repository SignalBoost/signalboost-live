import { NextResponse } from 'next/server';
import { getTrafficAnalytics } from '@/lib/analytics/outreach';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return NextResponse.json(await getTrafficAnalytics(request.url));
}
