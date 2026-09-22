import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  assessBuilderResidency,
  decideResidencyEvidence,
} from '@/lib/ai/cos/cosUniversityResidency'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import {
  BUILDER_RESIDENCY_TEACHING_CASE_IDS,
  type BuilderResidencyTeachingCaseId,
} from '@/platform-harness/cases/builder-residency-teaching'
import { executeBuilderResidencyTeachingCase } from '@/platform-harness/cases/builder-residency-live'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

const clean = (value: unknown, max = 500) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function caseId(value: unknown): BuilderResidencyTeachingCaseId | null {
  const normalized = clean(value, 120)
  return BUILDER_RESIDENCY_TEACHING_CASE_IDS.includes(
    normalized as BuilderResidencyTeachingCaseId,
  ) ? normalized as BuilderResidencyTeachingCaseId : null
}

function routeFor(status: string): string {
  if (status === 'passed') return 'durable_evidence'
  if (status === 'competency_failed') return 'university'
  if (status === 'infrastructure_failure') return 'self_healing'
  if (status === 'authority_halt') return 'referee_guardian'
  return 'harness_assurance'
}

function terminalStatus(status: string): string {
  if (status === 'success') return 'passed'
  if (status === 'agent_failure') return 'competency_failed'
  if (status === 'infrastructure_failure') return 'infrastructure_failure'
  if (status === 'authority_halt') return 'authority_halt'
  if (status === 'verification_failure') return 'verification_failure'
  return 'harness_failure'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.COS_UNIVERSITY_RESIDENCY_ENABLED !== 'true') {
    await recordCosUniversityProductionPath({
      path: 'practical_residency',
      invocationSucceeded: false,
      evidence: {
        enabled: false,
        runnerInvoked: false,
        status: 'disabled',
      },
    }).catch(() => undefined)
    return NextResponse.json({ ok: true, enabled: false })
  }

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json(
      { ok: false, error: 'service_database_unavailable' },
      { status: 503 },
    )
  }

  const claimed = await db.rpc('cos_claim_next_builder_residency_case')
  if (claimed.error) {
    return NextResponse.json(
      { ok: false, error: claimed.error.message },
      { status: 500 },
    )
  }

  const row = Array.isArray(claimed.data) ? claimed.data[0] : null
  if (!row) {
    const evidence = {
      enabled: true,
      runnerInvoked: false,
      status: 'nothing_due',
      caseExecuted: false,
    }
    await recordCosUniversityProductionPath({
      path: 'practical_residency',
      invocationSucceeded: true,
      evidence,
    }).catch(() => undefined)
    return NextResponse.json({ ok: true, ...evidence })
  }

  const claimedCaseId = caseId(row.case_id)
  if (!claimedCaseId) {
    await db
      .from('cos_university_residency_case_runs')
      .update({
        status: 'harness_failure',
        failure_route: 'harness_assurance',
        failure_code: 'builder_residency_case_unknown',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.case_run_id)
    return NextResponse.json(
      { ok: false, error: 'builder_residency_case_unknown' },
      { status: 500 },
    )
  }

  await db
    .from('cos_university_residency_case_runs')
    .update({
      status: 'running',
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.case_run_id)
    .eq('status', 'provisioning')

  try {
    const execution = await executeBuilderResidencyTeachingCase({
      caseRunId: String(row.case_run_id),
      harnessRunId: String(row.harness_run_id),
      caseId: claimedCaseId,
      expectedVariantHash: String(row.variant_hash),
      candidateId: String(row.candidate_id),
      subjectId: String(row.subject_id),
      artifactId: String(row.trained_artifact_id),
      artifactRevision: String(row.artifact_revision),
      artifactHash: String(row.trained_artifact_hash),
    })

    const status = terminalStatus(execution.harnessResult.outcome.status)
    const observedAt = new Date().toISOString()
    let universityEvidenceHash: string | null = null
    let competencyEvidenceRecorded = false

    if (status === 'passed' || status === 'competency_failed') {
      const evidence = decideResidencyEvidence({
        candidateId: String(row.candidate_id),
        trainedArtifactHash: String(row.trained_artifact_hash),
        subjectId: String(row.subject_id),
        caseFamily: execution.caseFamily,
        variantHash: execution.variantHash,
        competencyId: execution.competencyId,
        outcome: status === 'passed' ? 'pass' : 'fail',
        observedAt,
        sandboxed: true,
        supervised: true,
        exactArtifactBound: true,
        finalExamMaterialUsed: false,
        authorityExpanded: execution.harnessResult.authorityExpanded,
        productionMutationObserved:
          execution.harnessResult.productionMutationObserved,
        toolTrajectoryEvidenceHash: execution.trajectoryEvidenceHash,
      })

      if (!evidence.accepted || !evidence.evidenceHash) {
        throw new Error(
          `residency_evidence_rejected:${evidence.blockers.join(',')}`,
        )
      }
      universityEvidenceHash = evidence.evidenceHash

      const inserted = await db
        .from('cos_university_residency_competency_evidence')
        .upsert({
          residency_id: row.residency_id,
          case_run_id: row.case_run_id,
          competency_id: execution.competencyId,
          case_family: execution.caseFamily,
          variant_hash: execution.variantHash,
          tool_trajectory_evidence_hash: execution.trajectoryEvidenceHash,
          evidence_hash: evidence.evidenceHash,
          outcome: status === 'passed' ? 'pass' : 'fail',
          sandboxed: true,
          supervised: true,
          exact_artifact_bound: true,
          final_exam_material_used: false,
          authority_expanded: false,
          production_mutation_observed: false,
          observed_at: observedAt,
          metadata: {
            profile: 'builder-residency-live-runner-v1',
            caseId: claimedCaseId,
            verifierRef: execution.harnessResult.outcome.verifierRef ?? null,
            runtimeSemantics: execution.lease.semantics,
            runtimeIdentityEvidenceHash:
              execution.lease.runtimeIdentityEvidenceHash,
            verifierEvidenceHash: execution.verifierEvidenceHash,
            productionTrafficAuthorized: false,
            promotionAuthorized: false,
          },
        }, {
          onConflict: 'case_run_id,competency_id',
          ignoreDuplicates: true,
        })

      if (inserted.error) throw inserted.error
      competencyEvidenceRecorded = true
    }

    const updated = await db
      .from('cos_university_residency_case_runs')
      .update({
        status,
        runtime_endpoint_id: execution.lease.endpointId,
        runtime_model_name: execution.lease.modelName,
        runtime_identity_evidence_hash:
          execution.lease.runtimeIdentityEvidenceHash,
        tool_trajectory_evidence_hash: execution.trajectoryEvidenceHash,
        university_evidence_hash: universityEvidenceHash,
        failure_route: routeFor(status),
        failure_code: status === 'passed'
          ? null
          : execution.harnessResult.outcome.failureCode ?? status,
        authority_expanded: false,
        production_mutation_observed: false,
        finished_at: observedAt,
        updated_at: observedAt,
      })
      .eq('id', row.case_run_id)

    if (updated.error) throw updated.error

    if (competencyEvidenceRecorded) {
      const allEvidence = await db
        .from('cos_university_residency_competency_evidence')
        .select('competency_id,variant_hash,outcome,observed_at')
        .eq('residency_id', row.residency_id)
        .order('observed_at', { ascending: true })

      if (allEvidence.error) throw allEvidence.error

      const assessment = assessBuilderResidency(
        (allEvidence.data ?? []).map(item => ({
          competencyId: String(item.competency_id),
          variantHash: String(item.variant_hash),
          outcome: item.outcome === 'pass' ? 'pass' as const : 'fail' as const,
          observedAt: String(item.observed_at),
          accepted: true,
        })),
      )

      const enrollmentUpdate = await db
        .from('cos_university_residency_enrollments')
        .update({
          standing: assessment.standing,
          updated_at: observedAt,
        })
        .eq('id', row.residency_id)

      if (enrollmentUpdate.error) throw enrollmentUpdate.error
    }

    const assuranceEvidence = {
      enabled: true,
      runnerInvoked: true,
      caseExecuted: true,
      status,
      caseRunId: row.case_run_id,
      caseId: claimedCaseId,
      competencyId: execution.competencyId,
      variantHash: execution.variantHash,
      runtimeIdentityEvidenceHash:
        execution.lease.runtimeIdentityEvidenceHash,
      toolTrajectoryEvidenceHash: execution.trajectoryEvidenceHash,
      universityEvidenceHash,
      finalExamMaterialUsed: false,
      finalCanaryRecorded: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
      productionMutationObserved: false,
      route: routeFor(status),
    }

    await recordCosUniversityProductionPath({
      path: 'practical_residency',
      invocationSucceeded:
        status !== 'infrastructure_failure' && status !== 'harness_failure',
      evidence: assuranceEvidence,
    }).catch(() => undefined)

    return NextResponse.json({
      ok: true,
      ...assuranceEvidence,
    })
  } catch (error) {
    const message = clean(
      error instanceof Error ? error.message : 'builder_residency_run_failed',
      500,
    )
    const now = new Date().toISOString()

    await db
      .from('cos_university_residency_case_runs')
      .update({
        status: 'infrastructure_failure',
        failure_route: 'self_healing',
        failure_code: message,
        authority_expanded: false,
        production_mutation_observed: false,
        finished_at: now,
        updated_at: now,
      })
      .eq('id', row.case_run_id)

    await recordCosUniversityProductionPath({
      path: 'practical_residency',
      invocationSucceeded: false,
      evidence: {
        enabled: true,
        runnerInvoked: true,
        caseExecuted: false,
        status: 'infrastructure_failure',
        caseRunId: row.case_run_id,
        caseId: claimedCaseId,
        error: message,
        route: 'self_healing',
        finalExamMaterialUsed: false,
        finalCanaryRecorded: false,
        productionTrafficAuthorized: false,
      },
    }).catch(() => undefined)

    return NextResponse.json(
      {
        ok: false,
        status: 'infrastructure_failure',
        route: 'self_healing',
        caseRunId: row.case_run_id,
        error: message,
      },
      { status: 503 },
    )
  }
}
