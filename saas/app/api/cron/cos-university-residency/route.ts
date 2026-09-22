import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
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

async function recordProduction(invocationSucceeded: boolean, evidence: Record<string, unknown>) {
  await recordCosUniversityProductionPath({
    path: 'practical_residency',
    invocationSucceeded,
    evidence,
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (String(process.env[ENABLED_FLAG] || '').trim() !== 'true') {
    await recordProduction(true, { skipped: true, reason: 'residency_disabled' })
    return NextResponse.json({ ok: true, skipped: true, reason: 'residency_disabled' })
  }

  try {
    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')

    // Residency starts from the trained-artifact ledger, before independent final evaluation or graduation.
    const artifacts = await db.from('cos_local_distillation_artifacts')
      .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,status,authority_expanded,created_at')
      .eq('status', 'evaluation_pending')
      .eq('subject_id', 'Computer Science & Coding')
      .order('created_at', { ascending: true })
      .limit(50)
    if (artifacts.error) throw artifacts.error

    for (const row of artifacts.data || []) {
      const decision = decideBuilderResidencyAdmission({
        artifactRowId: String(row.id || ''),
        candidateId: String(row.candidate_id || ''),
        subjectId: String(row.subject_id || ''),
        trainedArtifactId: String(row.trained_artifact_id || ''),
        trainedArtifactHash: String(row.trained_artifact_hash || ''),
        revisionKey: String(row.revision_key || ''),
        artifactStatus: String(row.status || ''),
        authorityExpanded: row.authority_expanded === true,
      })
      if (!decision.eligible) continue

      const existing = await db.from('cos_university_residency_enrollments')
        .select('id,standing')
        .eq('artifact_row_id', row.id)
        .eq('program_id', BUILDER_RESIDENCY_PROGRAM_ID)
        .maybeSingle()
      if (existing.error) throw existing.error
      if (existing.data) continue

      const admissionEvidenceHash = hash({
        profile: COS_UNIVERSITY_RESIDENCY_VERSION,
        programId: BUILDER_RESIDENCY_PROGRAM_ID,
        formalEducationStage: 'practical_residency',
        artifactRowId: row.id,
        candidateId: row.candidate_id,
        trainedArtifactId: row.trained_artifact_id,
        artifactHash: decision.artifactHash,
        revisionKey: decision.revisionKey,
        artifactStatus: row.status,
        authorityExpanded: false,
      })

      const enrolled = await db.from('cos_university_residency_enrollments').insert({
        artifact_row_id: row.id,
        candidate_id: row.candidate_id,
        subject_id: row.subject_id,
        trained_artifact_id: row.trained_artifact_id,
        trained_artifact_hash: decision.artifactHash,
        revision_key: decision.revisionKey,
        program_id: BUILDER_RESIDENCY_PROGRAM_ID,
        program_version: COS_UNIVERSITY_RESIDENCY_VERSION,
        formal_education_stage: 'practical_residency',
        standing: 'resident',
        admission_evidence_hash: admissionEvidenceHash,
        authority_expanded: false,
        admitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id,standing').single()
      if (enrolled.error) throw enrolled.error

      const result = {
        enrolled: true,
        residencyId: enrolled.data.id,
        standing: enrolled.data.standing,
        candidateId: row.candidate_id,
        artifactHash: decision.artifactHash,
        programId: BUILDER_RESIDENCY_PROGRAM_ID,
        formalEducationStage: 'practical_residency',
        productionAuthorityExpanded: false,
      }
      await recordProduction(true, result)
      return NextResponse.json({ ok: true, ...result })
    }

    await recordProduction(true, { skipped: true, reason: 'no_trained_builder_student_waiting_for_residency' })
    return NextResponse.json({ ok: true, enrolled: false, reason: 'no_trained_builder_student_waiting_for_residency' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordProduction(false, { error: message }).catch(() => {})
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
