import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  BUILDER_RESIDENCY_PROGRAM_ID,
  COS_UNIVERSITY_RESIDENCY_VERSION,
  decideResidencyAdmission,
  isBuilderResidencySubject,
} from '@/lib/ai/cos/cosUniversityResidency'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import {
  BUILDER_RESIDENCY_TEACHING_CASE_IDS,
  materializeBuilderResidencyTeachingCase,
} from '@/platform-harness/cases/builder-residency-teaching'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function exactArtifactRevision(evidenceRef: unknown): string | null {
  const match = /^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i.exec(
    String(evidenceRef ?? '').trim(),
  )
  return match?.[1]?.toLowerCase() ?? null
}

function finalGateEnabled(): boolean {
  return process.env.COS_UNIVERSITY_RESIDENCY_FINAL_GATE_ENABLED === 'true'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = process.env.COS_UNIVERSITY_RESIDENCY_ENABLED === 'true'
  if (!enabled) {
    await recordCosUniversityProductionPath({
      path: 'practical_residency',
      invocationSucceeded: false,
      evidence: {
        enabled: false,
        runnerInvoked: false,
        status: 'disabled',
      },
    }).catch(() => undefined)
    return NextResponse.json({ ok: true, enabled: false, enrolled: 0, queued: 0 })
  }

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json(
      { ok: false, error: 'service_database_unavailable' },
      { status: 503 },
    )
  }

  const artifacts = await db
    .from('cos_local_distillation_artifacts')
    .select(
      'id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,evidence_ref,revision_key,status,authority_expanded,created_at',
    )
    .eq('status', 'evaluation_pending')
    .eq('authority_expanded', false)
    .order('created_at', { ascending: true })
    .limit(30)

  if (artifacts.error) {
    return NextResponse.json(
      { ok: false, error: artifacts.error.message },
      { status: 500 },
    )
  }

  let eligible = 0
  let enrolled = 0
  let queued = 0
  let unsupported = 0
  const errors: string[] = []

  for (const raw of artifacts.data ?? []) {
    const row = raw as Record<string, unknown>
    const candidateId = String(row.candidate_id ?? '').trim()
    const subjectId = String(row.subject_id ?? '').trim()
    if (!isBuilderResidencySubject(subjectId)) continue
    if (!candidateId.startsWith('mass:')) {
      unsupported += 1
      continue
    }

    const artifactRevision = exactArtifactRevision(row.evidence_ref)
    if (!artifactRevision) {
      errors.push(`artifact_revision_missing:${candidateId}`)
      continue
    }

    const admission = decideResidencyAdmission({
      artifactRowId: String(row.id ?? ''),
      candidateId,
      subjectId,
      trainedArtifactId: String(row.trained_artifact_id ?? ''),
      trainedArtifactHash: String(row.trained_artifact_hash ?? ''),
      revisionKey: String(row.revision_key ?? ''),
      artifactStatus: String(row.status ?? ''),
      authorityExpanded: row.authority_expanded === true,
    })
    if (!admission.eligible) continue
    eligible += 1

    const admissionEvidenceHash = sha256({
      profile: COS_UNIVERSITY_RESIDENCY_VERSION,
      claim: 'practical_residency_admission',
      candidateId,
      subjectId,
      artifactRowId: row.id,
      trainedArtifactId: row.trained_artifact_id,
      artifactRevision,
      trainedArtifactHash: admission.artifactHash,
      revisionKey: admission.revisionKey,
      formalEducationStage: admission.formalEducationStage,
      authorityExpanded: false,
    })

    const saved = await db
      .from('cos_university_residency_enrollments')
      .upsert({
        artifact_row_id: row.id,
        candidate_id: candidateId,
        subject_id: subjectId,
        trained_artifact_id: row.trained_artifact_id,
        artifact_revision: artifactRevision,
        trained_artifact_hash: admission.artifactHash,
        revision_key: admission.revisionKey,
        program_id: BUILDER_RESIDENCY_PROGRAM_ID,
        residency_version: COS_UNIVERSITY_RESIDENCY_VERSION,
        formal_education_stage: 'practical_residency',
        admission_evidence_hash: admissionEvidenceHash,
        gate_enforced: finalGateEnabled(),
        authority_expanded: false,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'trained_artifact_hash,revision_key',
        ignoreDuplicates: false,
      })
      .select('id,candidate_id,standing')
      .maybeSingle()

    if (saved.error) {
      errors.push(`enrollment:${candidateId}:${saved.error.message}`)
      continue
    }
    if (!saved.data?.id) {
      errors.push(`enrollment_missing:${candidateId}`)
      continue
    }

    enrolled += 1
    for (const caseId of BUILDER_RESIDENCY_TEACHING_CASE_IDS) {
      const teachingCase = materializeBuilderResidencyTeachingCase(caseId, candidateId)
      const inserted = await db
        .from('cos_university_residency_case_runs')
        .upsert({
          residency_id: saved.data.id,
          case_id: teachingCase.id,
          case_family: teachingCase.caseFamily,
          competency_id: teachingCase.competencyId,
          variant_hash: teachingCase.variantHash,
          status: 'queued',
          harness_run_id: `residency:${saved.data.id}:${teachingCase.variantHash.slice(0, 16)}`,
          authority_expanded: false,
          production_mutation_observed: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'residency_id,case_id,variant_hash',
          ignoreDuplicates: true,
        })

      if (inserted.error) {
        errors.push(`queue:${candidateId}:${caseId}:${inserted.error.message}`)
      } else {
        queued += 1
      }
    }
  }

  const evidence = {
    enabled: true,
    runnerInvoked: false,
    caseExecuted: false,
    status: errors.length ? 'enrollment_completed_with_errors' : 'enrollment_completed',
    eligible,
    enrolled,
    queued,
    unsupportedArtifactFamilies: unsupported,
    errors,
    gateEnforced: finalGateEnabled(),
    finalExamMaterialUsed: false,
    productionTrafficAuthorized: false,
  }

  await recordCosUniversityProductionPath({
    path: 'practical_residency',
    invocationSucceeded: errors.length === 0,
    evidence,
  }).catch(error => {
    errors.push(
      `assurance:${error instanceof Error ? error.message : 'record_failed'}`,
    )
  })

  return NextResponse.json({
    ok: errors.length === 0,
    ...evidence,
  }, { status: errors.length ? 207 : 200 })
}
