// saas/tests/generalReasoningBallast.node.test.ts
//
// Production 2026-09-29, 220 independent evaluations, per-case scores: distillation TAUGHT one reasoning skill and
// ERASED two others.
//   transfer-base-rate-quantified  0.000 -> 0.927   helped 204 / hurt   0
//   transfer-survivorship          1.000 -> 0.382   helped   0 / hurt 136
//   transfer-regression-mean       0.455 -> 0.127   helped   2 / hurt  74
// Survivorship reasoning was PERFECT in the untrained base model and the adapter destroyed it. Each artifact trains on
// ~25 items drawn from ONE subject with no rehearsal set, so every reasoning skill the subject never exercises drifts.
// The worker now replays a tiny fixed ballast after GKD, covering exactly the two skills the evidence shows being lost.
//
// The whole value of that ballast depends on it NOT being the exam. These tests fail the build if any ballast text
// reuses evaluator wording, if it stops covering the two damaged skills, or if the pass stops running last.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const worker = read('../scripts/cos-university-hf-worker.py')

function ballastLiteral(): string {
  const open = worker.indexOf('GENERAL_REASONING_BALLAST: list[dict[str, str]] = [')
  assert.ok(open >= 0, 'the worker no longer defines GENERAL_REASONING_BALLAST')
  const close = worker.indexOf('\n]\n', open)
  assert.ok(close > open, 'GENERAL_REASONING_BALLAST is not a closed list literal')
  return worker.slice(open, close)
}

test('the ballast covers exactly the reasoning skills Production measured the adapter losing', () => {
  const literal = ballastLiteral()
  const skills = [...literal.matchAll(/"skill":\s*"([a-z-]+)"/g)].map(match => match[1])
  assert.ok(skills.length >= 6, `expected a usable ballast, found ${skills.length} rows`)
  assert.deepEqual([...new Set(skills)].sort(), ['regression-to-the-mean', 'survivorship'])
  // Both damaged skills must be rehearsed. One row each would be rehearsal in name only.
  for (const skill of ['survivorship', 'regression-to-the-mean']) {
    assert.ok(
      skills.filter(entry => entry === skill).length >= 3,
      `${skill} needs at least three rehearsal rows; it fell to a fraction of base in Production`,
    )
  }
  const prompts = [...literal.matchAll(/"prompt":\s*"((?:[^"\\]|\\.)*)"/g)].map(match => match[1])
  const responses = [...literal.matchAll(/"response":\s*"((?:[^"\\]|\\.)*)"/g)].map(match => match[1])
  assert.equal(prompts.length, skills.length)
  assert.equal(responses.length, skills.length)
  assert.equal(new Set(prompts).size, prompts.length, 'ballast prompts must be distinct')
  for (const response of responses) {
    assert.ok(response.length > 60, `ballast answer is too thin to teach anything: ${response}`)
  }
})

test('no ballast text reuses the evaluator questions', () => {
  const text = ballastLiteral().toLowerCase()
  // Distinctive wording, figures and scenarios from the fixed transfer/retention/holdout questions.
  // Teaching a skill with different material is rehearsal; reusing the exam is training on the test.
  for (const phrase of [
    'framework', 'ten worst regions', 'treatment a', '95% sensitive', '1% of items', 'dashboard', '30 days',
    '10% of requests', '3 of 5', '400 of 1,000', 'incidents down to 12', '18%', 'redesign', '70% likely',
    'three times more probable', 'defective', 'vendor', 'checkout', 'promotion', 'still running', 'rises or falls',
    'decommissioned', 'mild patients', 'severe patients', 'api_key', 'signed', 'customer table',
  ]) assert.ok(!text.includes(phrase), `ballast reuses evaluator wording: ${phrase}`)
})

test('the ballast is replayed after GKD, bounded, and reported in the receipt', () => {
  // It must run LAST. GKD optimises toward a general-purpose dense teacher; a rehearsal pass before it
  // would simply be overwritten, which is the same reason the failure-derived replay runs after GKD.
  const ballastPass = worker.indexOf('if frontier_plan is not None and general_ballast_training:')
  const replayPass = worker.indexOf('if frontier_plan is not None and failure_derived_replay_training:')
  const save = worker.indexOf('trainer.save_model(str(output_dir))')
  assert.ok(replayPass > 0 && ballastPass > replayPass, 'the ballast pass must run after the failure-derived replay')
  assert.ok(save > ballastPass, 'the ballast pass must run before the adapter is saved')

  // Same bounded epochs and learning rate as the failure-derived replay: enough to survive GKD, not
  // enough to turn a subject adapter into a general-reasoning adapter.
  assert.match(worker, /GENERAL_REASONING_BALLAST_MAX_ITEMS = 8\b/)
  assert.match(worker, /GENERAL_REASONING_BALLAST_EPOCHS = 3\.0\b/)
  assert.match(worker, /GENERAL_REASONING_BALLAST_LEARNING_RATE = 5e-5\b/)
  assert.match(worker, /GENERAL_REASONING_BALLAST_GRADIENT_ACCUMULATION = 1\b/)
  assert.match(worker, /"generalReasoningBallastItems": len\(general_ballast_training\)/)
  assert.match(worker, /itmounts_general_reasoning_ballast:/)

  // Rendered through the same chat contract as every other training row, or the ballast introduces a
  // format skew the evaluator would read as damage.
  assert.match(worker, /ballast_text, ballast_structured = _student_training_text\(/)
  assert.match(worker, /worker_general_reasoning_ballast_structured_row_required/)
  assert.match(worker, /worker_general_reasoning_ballast_incomplete/)
})

test('the durable receipt keeps the ballast fields instead of silently dropping them', () => {
  // durableTrainingReceipt copies an allow-list; a field missing there never reaches the artifact row,
  // so the ballast would run invisibly and no gate could ever audit it.
  const consumer = read('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /generalReasoningBallastItems: integer\('generalReasoningBallastItems', 0, 100_000\)/)
  assert.match(consumer, /generalReasoningBallastEpochs: number\('generalReasoningBallastEpochs', 0, 10\)/)
  assert.match(consumer, /generalReasoningBallastLearningRate: number\('generalReasoningBallastLearningRate', 0, 1\)/)
  assert.match(consumer, /generalReasoningBallastTrainer: clean\(raw\.generalReasoningBallastTrainer, 80\) \|\| null/)
  assert.match(
    consumer,
    /generalReasoningBallastTrainableFp32TensorCount: integer\('generalReasoningBallastTrainableFp32TensorCount', 0, 1_000_000\)/,
  )
})
