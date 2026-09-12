import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getCOSA2AQualificationAssessmentPort } from '@/a2a-host/cos-runtime-host'
import {
  assertSpecialistQualificationAssessmentCorrelation,
  persistSupabaseSpecialistQualificationAssessment,
} from '@/a2a-host/specialist-qualification-assessment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function exact(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`qualification_assessment_invalid_${name}`)
  return normalized
}

/**
 * Owner-only operator endpoint. Callers select only exact scope + candidate/skill.
 * Probe content, transport, verifier and scoring are host-owned and never supplied by the request.
 */
export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const port = getCOSA2AQualificationAssessmentPort()
  if (!port) return NextResponse.json({ ok: false, error: 'a2a_qualification_assessor_unavailable' }, { status: 503 })

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !serviceRoleKey) return NextResponse.json({ ok: false, error: 'a2a_qualification_evidence_store_unavailable' }, { status: 503 })

  const body: any = await req.json().catch(() => ({}))
  let input: { tenantId: string; environmentId: string; portableId: string; agentId: string; skillId: string }
  try {
    input = {
      tenantId: exact(body.tenantId, 'tenant_id'),
      environmentId: exact(body.environmentId, 'environment_id'),
      portableId: exact(body.portableId, 'portable_id'),
      agentId: exact(body.agentId, 'agent_id'),
      skillId: exact(body.skillId, 'skill_id'),
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'a2a_qualification_scope_invalid' }, { status: 400 })
  }

  const assessmentId = crypto.randomUUID()
  try {
    const expected = { ...input, assessmentId }
    const record = await port.assess(expected)
    assertSpecialistQualificationAssessmentCorrelation(record, expected)
    const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    await persistSupabaseSpecialistQualificationAssessment(db, record)
    return NextResponse.json({
      ok: true,
      qualification: {
        assessmentId: record.assessmentId,
        tenantId: record.tenantId,
        environmentId: record.environmentId,
        portableId: record.portableId,
        agentId: record.agentId,
        skillId: record.skillId,
        qualified: record.qualified,
        verifierId: record.verifierId,
        evidenceRef: record.evidenceRef,
        observedAt: record.observedAt,
        validUntil: record.validUntil,
      },
      execution_allowed: false,
      external_action_taken: false,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'a2a_qualification_assessment_failed',
      assessmentId,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 409, headers: { 'cache-control': 'no-store' } })
  }
}
