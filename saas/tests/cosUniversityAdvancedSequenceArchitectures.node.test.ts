import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('advanced sequence architectures remain a research-only University track', () => {
  const roadmap = source('../../docs/COS-UNIVERSITY-ADVANCED-SEQUENCE-ARCHITECTURES-2026-09-25.md')
  const onboard = source('../../ONBOARD.md')
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  const worker = source('../scripts/cos-university-hf-worker.py')

  assert.match(roadmap, /research-only; no Production activation/)
  assert.match(roadmap, /Linear attention \/ linear RNN state/)
  assert.match(roadmap, /Test-Time Training \(TTT\)/)
  assert.match(roadmap, /ephemeral, reset-on-evaluation-case state/)
  assert.match(roadmap, /No Production traffic and no graduate eligibility/)
  assert.match(onboard, /Advanced Sequence Architecture research invariant/)

  assert.match(consumer, /MASS_DISTILLATION_STUDENT_MODEL = 'Qwen\/Qwen3-4B'/)
  assert.match(worker, /XSA_ROLLOUT_PERCENT = 0/)
})
