import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { importCuratedCorpus } from '@/lib/business-intelligence-corpus/import'
import type { BusinessIntelligenceRecord } from '@/lib/business-intelligence-corpus/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await req.json().catch(() => ({}))
  const records = Array.isArray(body?.records) ? body.records as BusinessIntelligenceRecord[] : []
  const report = await importCuratedCorpus(records)
  return NextResponse.json({ ok: report.failed === 0, ...report })
}
