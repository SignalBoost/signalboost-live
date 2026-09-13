import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  dispatchUniversityApprovedTraining,
  dispatchUniversityDatasetPreparation,
  requireExplicitTrainingDispatchConfirmation,
  trainingExecutorReadiness,
  type TrainingMode,
} from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import { registerCosUniversityDistillationTrainingPlan } from '@/lib/ai/cos/cosUniversityDistillationDatasetPlan'
import { dispatchCosUniversityDistillationTeacherDataset } from '@/lib/ai/cos/cosUniversityDistillationTeacherDataset'
import { installHuggingFaceTrainingExecutorEnv } from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'
import type { FineTuneRevision } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'
import type { ModelDistillationCandidateInput, ModelDistillationTrainingRights } from '@/lib/ai/cos/cosUniversityModelDistillation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function statusForError(message: string): number {
  if (message === 'training_executor_not_configured' || message === 'training_executor_dispatch_disabled') return 503
  if (message.startsWith('training_executor_')
    || message.startsWith('huggingface_training_')
    || message.startsWith('distillation_dataset_')
    || message.startsWith('teacher_dataset_')) return 400
  return 500
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const provider = installHuggingFaceTrainingExecutorEnv()
  return NextResponse.json({ ok: true, provider: provider.provider, ...trainingExecutorReadiness() }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  installHuggingFaceTrainingExecutorEnv()
  let body: any = null
  try { body = await request.json() } catch { body = null }

  try {
    const operation = String(body?.operation || '')

    // Metadata-only registration is intentionally separated from dispatch. It cannot start a Job,
    // spend credits, approve training, or enable the server-side dispatch feature.
    if (operation === 'register_distillation_dataset') {
      const result = await registerCosUniversityDistillationTrainingPlan({
        candidateId: String(body?.candidateId || ''),
        teacherModelId: String(body?.teacherModelId || ''),
        studentModelId: String(body?.studentModelId || ''),
        studentControlledByBuyer: body?.studentControlledByBuyer === true,
        sourceRef: String(body?.sourceRef || ''),
        provenanceRefs: Array.isArray(body?.provenanceRefs) ? body.provenanceRefs.map((value: unknown) => String(value)) : [],
        trainingRights: String(body?.trainingRights || 'unknown') as ModelDistillationTrainingRights,
        containsPrivateProductionData: body?.containsPrivateProductionData,
        teacherOutputItemHashes: Array.isArray(body?.teacherOutputItemHashes) ? body.teacherOutputItemHashes.map((value: unknown) => String(value)) : [],
      })
      return NextResponse.json({ ok: true, ...result }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }

    // Teacher generation is GPU work and therefore cost-bearing. It shares the same explicit owner
    // confirmation and global dispatch kill switch as partition preparation and model training.
    requireExplicitTrainingDispatchConfirmation(body?.confirmDispatch)
    if (operation === 'generate_teacher_dataset') {
      const result = await dispatchCosUniversityDistillationTeacherDataset({
        candidateId: String(body?.candidateId || ''),
        confirmDispatch: body?.confirmDispatch,
      })
      return NextResponse.json({ ok: true, ...result }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }
    if (operation === 'prepare_dataset') {
      const result = await dispatchUniversityDatasetPreparation({
        candidateId: String(body?.candidateId || ''),
        baseModel: String(body?.baseModel || ''),
        confirmDispatch: body?.confirmDispatch,
      })
      return NextResponse.json({ ok: true, ...result }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }
    if (operation === 'train') {
      const revision: FineTuneRevision = {
        baseModel: String(body?.revision?.baseModel || ''),
        datasetHash: String(body?.revision?.datasetHash || ''),
        trainingManifestHash: String(body?.revision?.trainingManifestHash || ''),
        holdoutManifestHash: String(body?.revision?.holdoutManifestHash || ''),
      }
      const trainingMode = String(body?.trainingMode || '') as TrainingMode
      const distillation = body?.distillation
        ? body.distillation as ModelDistillationCandidateInput
        : null
      const result = await dispatchUniversityApprovedTraining({
        candidateId: String(body?.candidateId || ''),
        revision,
        trainingMode,
        distillation,
        confirmDispatch: body?.confirmDispatch,
      })
      return NextResponse.json({ ok: true, ...result }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }
    return NextResponse.json({ ok: false, error: 'training_executor_operation_invalid' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: statusForError(message) })
  }
}
