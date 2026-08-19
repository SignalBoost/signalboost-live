import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { capabilityBenchmarkGate, promoteBenchmarkCandidates, recordCapabilityFailure } from '@/lib/ai/cos/benchmarkCuration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const [pending, promoted, rejected, activeCases, gate] = await Promise.all([
    db.from('cos_capability_benchmark_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('cos_capability_benchmark_candidates').select('id', { count: 'exact', head: true }).eq('status', 'promoted'),
    db.from('cos_capability_benchmark_candidates').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    db.from('cos_capability_benchmark_cases').select('id', { count: 'exact', head: true }).eq('active', true),
    capabilityBenchmarkGate(),
  ])

  const error = pending.error || promoted.error || rejected.error || activeCases.error
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    candidates: { pending: pending.count ?? 0, promoted: promoted.count ?? 0, rejected: rejected.count ?? 0 },
    activeCases: activeCases.count ?? 0,
    gate,
    policy: { batchSize: 2, targetActiveCases: '20-50', autoPromotionMinOccurrences: 2, deploymentThreshold: 0.95 },
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'promote')

  if (action === 'promote') {
    const result = await promoteBenchmarkCandidates({ minOccurrences: body.minOccurrences, limit: body.limit })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  }

  if (action === 'ingest') {
    const result = await recordCapabilityFailure({
      prompt: String(body.prompt || ''),
      track: String(body.track || 'general'),
      failureKind: body.failureKind || 'unhandled_error',
      requiredTerms: body.requiredTerms,
      forbiddenTerms: body.forbiddenTerms,
      requiresLocalReasoning: body.requiresLocalReasoning !== false,
      sourceMetadata: { source: 'owner_ingest', route: body.route, statusCode: body.statusCode },
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 })
}
