import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import { repositoryRepairV2Objective } from '../lib/builder/repository-repair-v2.ts'

test('unselected proof instructs Builder V2 to reproduce the specific failure', () => {
  const objective = repositoryRepairV2Objective('Repair the actual Builder workflow', null)
  assert.match(objective, /targeted regression assertion/)
  assert.match(objective, /RUN that test/)
  assert.match(objective, /passing existing test.*diagnostic/)
  assert.match(objective, /same regression/)
})

test('host-selected proof remains exact and does not add unsolicited reproduction directives', () => {
  const objective = repositoryRepairV2Objective('Repair Builder', 'node --test tests/failing.node.test.ts')
  assert.match(objective, /Required execution:\nnode --test tests\/failing.node.test.ts/)
  assert.doesNotMatch(objective, /No failing proof was supplied/)
})

test('no-patch terminal response provides the precise missing action', () => {
  const reply = formatBuilderOperatorRepairReply({ ok: false, error: 'builder_repository_repair_produced_no_patch', trace: [] })
  assert.match(reply, /No source patch was produced/)
  assert.match(reply, /targeted regression/)
  assert.doesNotMatch(reply, /inspect the remaining task blocker/)
})

test('repeated inspection terminal response names the actual blocked tool progression', () => {
  const reply = formatBuilderOperatorRepairReply({ ok: false, error: 'builder_stalled_repeated_inspection', trace: [] })
  assert.match(reply, /Execution stalled on repeated inspection/)
  assert.match(reply, /unchanged reads or passing tests/)
})

test('unreproduced proof distinguishes passing tests from verified repair', () => {
  const reply = formatBuilderOperatorRepairReply({ ok: false, error: 'builder_regression_not_reproduced', trace: [] })
  assert.match(reply, /selected proof passed on the unchanged source/)
  assert.doesNotMatch(reply, /Fixed —/)
})
