import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const workflow = fs.readFileSync(path.join(process.cwd(),'lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'),'utf8')
const packager = fs.readFileSync(path.join(process.cwd(),'lib/ai/cos/cosUniversityMassDistillation.ts'),'utf8')

test('rights-cleared source maintenance does not silently throttle the configured diversity budget', () => {
  assert.match(workflow, /maxSubjects: Math\.max\(6, throughput\.targetSubjectsPerReplenishment\)/)
  assert.match(workflow, /queriesPerSubject: throughput\.queriesPerSubject/)
  assert.match(workflow, /maxCandidatesPerCycle: throughput\.acquisitionCandidatesPerCycle/)
})

test('quality batches require the declared 50 percent independent real-source floor', () => {
  assert.match(packager, /minimumRealSource = Math\.ceil\(targetSize \* HYBRID_REAL_SOURCE_TARGET\)/)
  assert.match(packager, /if \(mix\.realSource < minimumRealSource\) return \[\]/)
})
