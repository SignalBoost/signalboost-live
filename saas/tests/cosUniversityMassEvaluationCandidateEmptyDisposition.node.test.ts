import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('repeated exact empty candidate answer is substantive only after solo retry', () => {
  assert.ok(source.includes('function candidateSoloEmptyAnswer(error:string)'))
  assert.ok(source.includes('finish=stop:think=0:open=1:close=1:other=0:cap=1024'))
  assert.ok(source.includes("mass_distilled_evaluation_candidate_answer_empty:"))
  assert.ok(source.includes('if(input.candidate&&candidateSoloEmptyAnswer(failure))'))
})
