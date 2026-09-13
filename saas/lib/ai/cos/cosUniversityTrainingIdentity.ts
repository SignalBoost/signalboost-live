import { createHash } from 'node:crypto'

export type ControlledFineTunePlanIdentityInput = Readonly<{
  plan_key: unknown
  subject_id: unknown
  failure_class: unknown
  objective: unknown
  methods: unknown
  source_ref: unknown
}>

/**
 * Canonical dataset identity shared by candidate packaging and the training executor. The shape and
 * property order intentionally match the original controlled-fine-tuning hash so existing candidates
 * keep the same dataset identity after this helper is introduced.
 */
export function controlledFineTuneDatasetDescriptor(plan: ControlledFineTunePlanIdentityInput) {
  return {
    plan: plan.plan_key,
    subject: plan.subject_id,
    failure: plan.failure_class,
    objective: plan.objective,
    methods: plan.methods,
    source: plan.source_ref,
  }
}

export function controlledFineTuneDatasetHash(plan: ControlledFineTunePlanIdentityInput): string {
  return createHash('sha256').update(JSON.stringify(controlledFineTuneDatasetDescriptor(plan))).digest('hex')
}
