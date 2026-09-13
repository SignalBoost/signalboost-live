import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('one-time student training job binds revision, host approvals, and distillation mode before dispatch', () => {
  const file = path.join(process.cwd(), 'lib/ai/cos/cosUniversityOneTimeStudentTrainingJob.ts')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /fineTuneRevisionKey\(revision\)/)
  assert.match(source, /approval\.revisionKey/)
  assert.match(source, /claim:\s*'dataset_approved'/)
  assert.match(source, /claim:\s*'training_approved'/)
  assert.match(source, /trainingMode:\s*'distillation'/)
  assert.match(source, /validateDistillationTrainingBinding/)
  assert.match(source, /controlled\.eligibleForTraining/)
  assert.match(source, /automaticPromotionAuthorized:\s*false/)
})
