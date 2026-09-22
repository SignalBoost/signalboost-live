import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  BUILDER_RESIDENCY_PROGRAM_ID,
  COS_UNIVERSITY_RESIDENCY_VERSION,
  decideBuilderResidencyAdmission,
} from '@/lib/ai/cos/cosUniversityResidency'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ENABLED_FLAG = 'COS_UNIVERSITY_RESIDENCY_ENABLED'

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (String(process.env[ENABLED_FLAG] || '').trim() !== 'true') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'residency_disabled' })
  }

  try {
    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')

    const graduates = await db.from('cos_university_graduate_model_registry')
      .select('id,candidate_id,subject_id,trained_artifact_hash,status,runtime_health_evidence_hash,activation_evidence_hash,authority_expanded,activated_at')
      .eq('status', 'active')
      .order('activated_at', { ascending: true })
      .limit(50)
    if (graduates.error) throw graduates.error

    for (const row of graduates.data || []) {
      const decision = decideBuilderResidencyAdmission({
        registryId: String(row.id || ''),
        candidateId: String(row.candidate_id || ''),
        subjectId: String(row.subject_id || ''),
        trainedArtifactHash: String(row.trained_artifact_hash || ''),
        registryStatus: String(row.status || ''),
        runtimeHealthEvidenceHash: row.runtime_health_evidence_hash ? String(row.runtime_health_evidence_hash) : null,
        activationEvidenceHash: row.activation_evidence_hash ? String(row.activation_evidence_hash) : null,
        authorityExpanded: row.authority_expanded === true,
      })
      if (!decision.eligible) continue

      const admissionEvidenceHash = hash({
        profile: COS_UNIVERSITY_RESIDENCY_VERSION,
        programId: BUILDER_RESIDENCY_PROGRAM_ID,
        registryId: row.id,
        candidateId: row.candidate_id,
        artifactHash: decision.artifactHash,
        runtimeHealthEvidenceHash: row.runtime_health_evidence_hash,
        activationEvidenceHash: row.activation_evidence_hash,
        authorityExpanded: false,
      })

      const enrolled = await db.from('cos_university_residency_enrollments').upsert({
        registry_id: row.id,
        candidate_id: row.candidate_id,
        subject_id: row.subject_id,
        trained_artifact_hash: decision.artifactHash,
        program_id: BUILDER_RESIDENCY_PROGRAM_ID,
        program_version: COS_UNIVERSITY_RESIDENCY_VERSION,
        standing: 'resident',
        admission_evidence_hash: admissionEvidenceHash,
        authority_expanded: false,
        admitted_at: row.activated_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'registry_id,program_id', ignoreDuplicates: true }).select('id,standing').maybeSingle()
      if (enrolled.error) throw enrolled.error

      return NextResponse.json({
        ok: true,
        enrolled: true,
        residencyId: enrolled.data?.id || null,
        standing: enrolled.data?.standing || 'resident',
        candidateId: row.candidate_id,
        programId: BUILDER_RESIDENCY_PROGRAM_ID,
        productionAuthorityExpanded: false,
      })
    }

    return NextResponse.json({ ok: true, enrolled: false, reason: 'no_builder_residency_candidate' })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
