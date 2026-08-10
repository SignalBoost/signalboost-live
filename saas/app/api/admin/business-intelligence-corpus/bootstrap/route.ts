import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { bootstrapCorpusFromEnterpriseMemory } from '@/lib/business-intelligence-corpus/bootstrap.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const report = await bootstrapCorpusFromEnterpriseMemory()
  return NextResponse.json({ ok: true, ...report })
}
