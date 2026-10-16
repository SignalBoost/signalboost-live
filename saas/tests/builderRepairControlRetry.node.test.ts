import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const loop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')

test('rejected repair inspection triggers another controlled edit opportunity', () => {
  const start = loop.indexOf('if (blockedAction) {')
  const end = loop.indexOf('if (!action) {', start)
  assert.ok(start >= 0 && end > start)
  const block = loop.slice(start, end)
  assert.match(block, /if \(repairMutationRequired \|\| repeatedRepairStall\)/)
  assert.match(block, /builder_repair_mutation_required/)
  assert.match(block, /Edit the relevant source file now/)
  assert.match(block, /continue/)
  assert.doesNotMatch(block, /return \{ ok: false, error:.*builder_repair_mutation_not_produced/)
  assert.match(loop, /builder_stalled_repeated_inspection/)
})

test('new application jobs prioritize missing deliverables over stale inspection', () => {
  assert.match(loop, /const missingBuildDeliverables = !repairObjective && builderTaskProgress\(task, workspacePaths, trace\)\.missingFiles\.length > 0/)
  assert.match(loop, /!missingBuildDeliverables && deniedInspections >= 4/)
  assert.match(loop, /!missingBuildDeliverables && consecutiveRepeatRejections >= MAX_CONSECUTIVE_REPEAT_REJECTIONS/)
  assert.match(loop, /!missingBuildDeliverables \|\| task\.files\.length <= 1 \|\| deniedInspections < 2 \|\| toolId === 'write_file'/)
  assert.match(loop, /progress\.missingFiles\[0\]/)
  assert.match(loop, /const verificationCommand =/)
})
