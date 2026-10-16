import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { builderV2TimeoutDisposition } from '../lib/builder/agent-v2-job-cycle.ts'

type Case = {
  unavailable: boolean; madeProgress: boolean
  deadline: boolean; checkpointPresent: boolean
  expected: 'continue' | 'pause' | 'fail'
}
test('Z3 symbolic execution: replay all V2 timeout transitions against real production policy', () => {
  const file = process.env.BUILDER_V2_Z3_FILE
  assert.ok(file, 'Z3 output file is mandatory; skipping would hide solver failures')
  const data = JSON.parse(readFileSync(file, 'utf8')) as {schema: string; cases: Case[]}
  assert.equal(data.schema, 'itmounts.builder.v2.z3.timeout.v1')
  assert.equal(data.cases.length, 16)
  for (const c of data.cases) {
    assert.equal(builderV2TimeoutDisposition(c), c.expected, JSON.stringify(c))
  }
})
