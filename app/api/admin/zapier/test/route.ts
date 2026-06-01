import { NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/admin/adminAccess'

const endpoints = [
  { name: 'Module event webhook', url: '/api/admin/zapier/test', trigger: 'module.used' },
  { name: 'Review sentiment webhook', url: '/api/admin/zapier/test', trigger: 'review.sentiment_scored' },
  { name: 'Analytics export webhook', url: '/api/admin/analytics/export', trigger: 'analytics.csv_requested' },
]

export async function GET() {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 })
  return NextResponse.json({ success: true, status: 'connected', endpoints })
}

export async function POST(req: Request) {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  return NextResponse.json({
    success: true,
    delivered: true,
    trigger: body.trigger || 'manual.test',
    endpoint: '/api/admin/zapier/test',
    tested_at: new Date().toISOString(),
  })
}
