import { NextRequest, NextResponse } from 'next/server'

const BLOCKED_MESSAGE = 'AI execution globally disabled by administrator override.'

async function isAutonomousExecutionEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Autonomous ingress must fail closed if its configuration cannot be read.
  if (!url || !anonKey) return false

  try {
    const response = await fetch(`${url}/rest/v1/system_status?select=ai_autonomous_execution_enabled&id=eq.global`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: 'no-store',
    })
    if (!response.ok) return false

    const rows = await response.json() as Array<{ ai_autonomous_execution_enabled?: boolean }>
    return rows.length === 1 && rows[0]?.ai_autonomous_execution_enabled === true
  } catch {
    return false
  }
}

export async function middleware(_request: NextRequest) {
  if (await isAutonomousExecutionEnabled()) return NextResponse.next()

  return NextResponse.json({ error: BLOCKED_MESSAGE }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
  })
}

export const config = {
  matcher: [
    '/api/cron/:path*',
    '/api/webhook/:path*',
    '/api/stripe/webhook',
    '/api/hub/webhooks/:path*',
    '/api/autonomous-supervisor/:path*',
    '/api/internal/supervisor/:path*',
    '/api/cos/script-worker/:path*',
  ],
}
