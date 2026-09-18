import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')

test('teacher dispatch deduplicates exact rendered prompt bodies before any provider submission', () => {
  assert.match(consumer, /const seenPromptBodies = new Set<string>\(\)/)
  assert.match(consumer, /const promptBodyHash = hash\(prompt\)/)
  assert.match(consumer, /if \(seenPromptBodies\.has\(promptBodyHash\)\) continue/)
  assert.match(consumer, /mass_distillation_teacher_prompt_diversity_insufficient:/)
  assert.match(consumer, /distinctPrompts: prompts\.length/)

  const diversityGate = consumer.indexOf('mass_distillation_teacher_prompt_diversity_insufficient:')
  const teacherModelLookup = consumer.indexOf('resolveHuggingFaceModelMetadata({ modelId: teacherModelId')
  const providerSubmit = consumer.indexOf('await submitHuggingFaceJob')
  assert.ok(diversityGate >= 0)
  assert.ok(teacherModelLookup > diversityGate)
  assert.ok(providerSubmit > teacherModelLookup)
})

test('teacher prompt diversity is durably evidenced before paid provider submission', () => {
  assert.match(consumer, /claim: 'mass_distillation_pre_dispatch_validated'/)
  assert.match(consumer, /sourceCount: sourceHashes\.length/)
  assert.match(consumer, /distinctPrompts,/)
  assert.match(consumer, /promptSetHash,/)
  assert.match(consumer, /maxEstimatedCostUsd,/)
  assert.match(consumer, /reservedCostCeilingUsd: expectedCeiling/)

  const fence = consumer.indexOf("mass_distillation_pre_dispatch_fence_lost")
  const preDispatchEvidence = consumer.indexOf("claim: 'mass_distillation_pre_dispatch_validated'")
  const providerSubmit = consumer.indexOf('await submitHuggingFaceJob')
  const postDispatchEvidence = consumer.indexOf("claim: 'mass_distillation_job_dispatched'")
  assert.ok(fence >= 0)
  assert.ok(preDispatchEvidence > fence)
  assert.ok(providerSubmit > preDispatchEvidence)
  assert.ok(postDispatchEvidence > providerSubmit)
})

test('post-dispatch evidence retains explicit distinct prompt count and prompt-set identity', () => {
  const postDispatch = consumer.slice(consumer.indexOf("claim: 'mass_distillation_job_dispatched'"))
  assert.match(postDispatch, /promptCount: claim\.stage === 'teacher_dispatching'/)
  assert.match(postDispatch, /distinctPrompts,/)
  assert.match(postDispatch, /promptSetHash,/)
})

test('prompt diversity preflight does not alter budget, retry, promotion or RunPod authority', () => {
  assert.doesNotMatch(consumer, /MASS_DISTILLATION_TEACHER_COST_CEILING_USD\s*=\s*(?!0\.20)/)
  assert.doesNotMatch(consumer, /automaticPromotionAuthorized:\s*true|runpodMutationAuthorized:\s*true/)
  assert.match(consumer, /campaign_stopped_on_first_failed_or_uncertain_dispatch_no_automatic_retry/)
})
