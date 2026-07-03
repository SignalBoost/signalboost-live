import { NextResponse } from 'next/server';
import { getClicksAnalytics } from '@/lib/analytics/outreach';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return NextResponse.json(await getClicksAnalytics(request.url));
}
