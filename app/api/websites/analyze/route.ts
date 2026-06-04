import { NextResponse } from 'next/server'
import { analyzeWebsite } from '@/lib/websites/analyzer'
import { persistWebsiteAudit } from '@/lib/websites/storage'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url : ''
    if (!url.trim()) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    const audit = await analyzeWebsite(url)
    const stored = await persistWebsiteAudit(typeof body.account_id === 'string' ? body.account_id : null, audit)
    return NextResponse.json({ ...audit, audit_id: stored.auditId, stored: stored.stored })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to analyze website.' }, { status: 400 })
  }
}
