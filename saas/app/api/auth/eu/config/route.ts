import { NextResponse } from 'next/server'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public ANON key only. Never expose the server-side Frankfurt service role. */
export async function GET() {
  if (!euCustomerLaunchReadiness().ready) {
    return NextResponse.json({ error: 'eu_enrollment_unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
  return NextResponse.json({
    url: process.env.EU_SUPABASE_URL,
    anonKey: process.env.EU_SUPABASE_ANON_KEY,
    region: 'eu-central-1',
    cookieName: 'itmounts-eu-auth',
  }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
