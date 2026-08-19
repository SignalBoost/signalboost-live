// saas/app/api/admin/cos-benchmark-candidates/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { harvestCandidates, validatePromotion, type ObservedFailureRow } from '@/lib/ai/cos/benchmarkCaseCandidates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GAP_SCAN_LIMIT = 500
const CORPUS_SUBJECT_LIMIT = 5000
const HARVEST_LIMIT = 50

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const [pending, cases] = await Promise.all([
    db.from('cos_benchmark_case_candidates')
      .select('id,track,prompt,observed_confidence,escalation_reason,repeated_count,contaminated,contamination_reason,status,created_at')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(200),
    db.from('cos_capability_benchmark_cases').select('id,active,track,origin,approved_by').limit(500),
  ])
  if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 500 })

  const rows = cases.data ?? []
  return NextResponse.json({
    ok: true,
    pending: pending.data ?? [],
    suite: {
      totalCases: rows.length,
      activeCases: rows.filter((row: any) => row.active).length,
      byOrigin: rows.reduce((acc: Record<string, number>, row: any) => {
        const origin = String(row.origin ?? 'curated')
        acc[origin] = (acc[origin] ?? 0) + 1
        return acc
      }, {}),
    },
    note: 'Candidates are captured automatically; cases are created by a person who supplies the pass criteria. Contaminated candidates cannot be promoted — COS has already studied that material, so a pass would not distinguish reasoning from recall.',
  })
}

async function harvest(db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  const [gaps, corpus, existing] = await Promise.all([
    db.from('cos_learning_gaps')
      .select('id,subject,question,capability,confidence,escalation_reason,status,repeated_count,created_at')
      .order('last_seen_at', { ascending: false }).limit(GAP_SCAN_LIMIT),
    db.from('cos_continuous_learning').select('subject').limit(CORPUS_SUBJECT_LIMIT),
    db.from('cos_benchmark_case_candidates').select('source_hash').limit(2000),
  ])
  if (gaps.error) return { ok: false as const, error: `cos_learning_gaps read failed: ${gaps.error.message}` }

  const studiedSubjects = (corpus.data ?? []).map((row: any) => String(row.subject ?? '')).filter(Boolean)
  const alreadyQueued = new Set((existing.data ?? []).map((row: any) => String(row.source_hash ?? '')))
  const result = harvestCandidates((gaps.data ?? []) as ObservedFailureRow[], { studiedSubjects, limit: HARVEST_LIMIT })
  const fresh = result.eligible.filter(candidate => !alreadyQueued.has(candidate.sourceHash))

  let inserted = 0
  for (const candidate of fresh) {
    const write = await db.from('cos_benchmark_case_candidates').insert({
      source_hash: candidate.sourceHash,
      origin: 'learning_gap',
      source_ref: candidate.sourceRef,
      track: candidate.track,
      prompt: candidate.prompt,
      observed_confidence: candidate.observedConfidence,
      escalation_reason: candidate.escalationReason,
      repeated_count: candidate.repeatedCount,
      contaminated: candidate.contaminated,
      contamination_reason: candidate.contaminationReason,
    })
    if (!write.error) inserted += 1
  }

  return {
    ok: true as const,
    considered: result.considered,
    eligible: result.eligible.length,
    alreadyQueued: result.eligible.length - fresh.length,
    inserted,
    contaminated: result.contaminated,
    skipped: result.skipped.slice(0, 40),
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (body.harvest === true) {
    const result = await harvest(db)
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  const candidateId = String(body.candidateId ?? '').trim()
  if (!candidateId) return NextResponse.json({ error: 'candidateId is required, or pass { "harvest": true }.' }, { status: 400 })

  const found = await db.from('cos_benchmark_case_candidates')
    .select('id,track,prompt,contaminated,status').eq('id', candidateId).maybeSingle()
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 })
  if (!found.data) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })

  if (body.reject === true) {
    const update = await db.from('cos_benchmark_case_candidates').update({
      status: 'rejected',
      reviewed_by: String(body.approvedBy ?? body.reviewedBy ?? guard.ctx.email ?? 'owner').slice(0, 200),
      reviewed_at: new Date().toISOString(),
      review_note: String(body.reviewNote ?? '').slice(0, 1000),
    }).eq('id', candidateId)
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, candidateId, status: 'rejected' })
  }

  const decision = validatePromotion(found.data as any, {
    candidateId,
    requiredTerms: body.requiredTerms,
    forbiddenTerms: body.forbiddenTerms,
    approvedBy: body.approvedBy ?? guard.ctx.email,
    track: body.track,
  })
  if ('error' in decision) return NextResponse.json({ ok: false, error: decision.error }, { status: 400 })

  const now = new Date().toISOString()
  const created = await db.from('cos_capability_benchmark_cases').insert({
    active: false,
    track: decision.track ?? String((found.data as any).track ?? 'general_reasoning'),
    prompt: String((found.data as any).prompt ?? ''),
    required_terms: decision.requiredTerms,
    forbidden_terms: decision.forbiddenTerms,
    requires_local_reasoning: true,
    origin: 'reviewed_capture',
    source_candidate_id: candidateId,
    approved_by: decision.approvedBy,
    approved_at: now,
  }).select('id').single()
  if (created.error || !created.data) return NextResponse.json({ error: created.error?.message ?? 'Could not create benchmark case.' }, { status: 500 })

  const update = await db.from('cos_benchmark_case_candidates').update({
    status: 'approved',
    reviewed_by: decision.approvedBy,
    reviewed_at: now,
    review_note: String(body.reviewNote ?? '').slice(0, 1000),
    promoted_case_id: created.data.id,
  }).eq('id', candidateId)
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    candidateId,
    caseId: created.data.id,
    active: false,
    note: 'Created inactive. Run it, read the reasons, then set active = true once the rubric is right.',
  })
}
