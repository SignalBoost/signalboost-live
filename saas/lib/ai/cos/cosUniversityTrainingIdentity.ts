import { createHash } from 'node:crypto'

export type ControlledFineTunePlanIdentityInput = Readonly<{
  plan_key: unknown
  subject_id: unknown
  failure_class: unknown
  objective: unknown
  methods: unknown
  source_ref: unknown
  evidence?: unknown
}>

type DatasetIdentityOptions = Readonly<{
  trainingSourceRef?: unknown
}>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/**
 * Failure/remediation lineage stays in source_ref. A separately governed training source may be
 * attached under evidence.distillationDataset.sourceRef; this prevents a failure UUID from ever
 * being mistaken for a Hugging Face dataset URL while preserving the original plan provenance.
 */
export function controlledFineTuneTrainingSourceRef(
  plan: ControlledFineTunePlanIdentityInput,
  options: DatasetIdentityOptions = {},
): string {
  const explicit = clean(options.trainingSourceRef, 2000)
  if (explicit) return explicit
  const binding = record(record(plan.evidence).distillationDataset)
  const registered = clean(binding.sourceRef, 2000)
  return registered || clean(plan.source_ref, 2000)
}

/**
 * Canonical dataset identity shared by candidate packaging and the training executor. Existing
 * candidates keep their historical identity until a dedicated governed training source is attached.
 * Once attached, the source binding becomes part of the hash so approvals cannot be reused across
 * different teacher-output datasets.
 */
export function controlledFineTuneDatasetDescriptor(
  plan: ControlledFineTunePlanIdentityInput,
  options: DatasetIdentityOptions = {},
) {
  return {
    plan: plan.plan_key,
    subject: plan.subject_id,
    failure: plan.failure_class,
    objective: plan.objective,
    methods: plan.methods,
    source: controlledFineTuneTrainingSourceRef(plan, options),
  }
}

export function controlledFineTuneDatasetHash(
  plan: ControlledFineTunePlanIdentityInput,
  options: DatasetIdentityOptions = {},
): string {
  return createHash('sha256').update(JSON.stringify(controlledFineTuneDatasetDescriptor(plan, options))).digest('hex')
}
