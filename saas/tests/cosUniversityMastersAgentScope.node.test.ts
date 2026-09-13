// saas/tests/cosUniversityMastersAgentScope.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/**
 * `readCosUniversityMastersRuntimeStatus(programId, now, sharedAdmissionState?, agentId = 'cos')`
 * defaults its learner to COS. Per-agent call sites must therefore pass the learner explicitly.
 * This regression also requires the bound specialist exam path to read and write the same learner's
 * evidence; recording only the run receipt is not enough to advance a Master's transcript.
 *
 * These modules import the Supabase client and cannot be imported here, so the contract is asserted
 * on source. The check is structural rather than three literal matches: any new call in an
 * agent-scoped module must pass a learner.
 */

const AGENT_SCOPED_MODULES = [
  'lib/ai/cos/cosUniversityMastersRuntime.ts',
  'lib/ai/cos/cosUniversityMastersExamRunner.ts',
  'lib/ai/cos/cosUniversityMastersLearningRunner.ts',
  'lib/ai/cos/cosUniversityPhdRuntime.ts',
] as const

/** Deliberately COS-only: its own AGENT_ID constant scopes every query it makes. */
const COS_ONLY_MODULES = ['lib/ai/cos/cosUniversityMastersProductionEvidence.ts'] as const

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

/** Call arguments at each `readCosUniversityMastersRuntimeStatus(...)`, brace- and paren-aware. */
function runtimeStatusCalls(source: string): string[] {
  const calls: string[] = []
  const needle = 'readCosUniversityMastersRuntimeStatus('
  for (let index = source.indexOf(needle); index >= 0; index = source.indexOf(needle, index + 1)) {
    const before = source.slice(Math.max(0, index - 20), index)
    if (/function\s*$/.test(before)) continue
    let depth = 0
    let end = index + needle.length - 1
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1
      else if (source[end] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    calls.push(source.slice(index + needle.length, end))
  }
  return calls
}

test('the parser finds calls and ignores the declaration itself', () => {
  const source = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const calls = runtimeStatusCalls(source)
  assert.ok(calls.length >= 4, `expected several calls, found ${calls.length}`)
  assert.ok(calls.every(call => !call.includes('sharedAdmissionState?')), 'declaration parsed as a call')
})

test('every Master\'s runtime read in an agent-scoped module names its learner', () => {
  for (const relative of AGENT_SCOPED_MODULES) {
    for (const call of runtimeStatusCalls(file(relative))) {
      const args = call.split(',').map(part => part.trim())
      assert.equal(args.length, 4, `${relative}: read must pass a learner, got (${call})`)
      assert.match(args[3], /agentId/, `${relative}: fourth argument must be the learner, got ${args[3]}`)
    }
  }
})

test('the enrollment and credential read-backs ask about the agent they just wrote for', () => {
  const source = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  // A read-back that confirms a write must be scoped to the same learner as the insert above it.
  for (const marker of ['enrollment_not_persisted', 'credential_not_persisted']) {
    const at = source.indexOf(marker)
    assert.ok(at > 0, `${marker} path is gone; re-point this regression`)
    const preceding = source.slice(0, at)
    const lastRead = preceding.lastIndexOf('readCosUniversityMastersRuntimeStatus(')
    const call = preceding.slice(lastRead)
    assert.match(call, /undefined, agentId\)/, `${marker} read-back is not agent-scoped`)
  }
})

test('the exam runner decides program activity for the learner it was invoked for', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersExamRunner.ts')
  const activity = runner.indexOf('readCosUniversityMastersRuntimeStatus(')
  const decision = runner.indexOf("status: 'program_inactive'")
  assert.ok(activity > 0 && activity < decision)
  assert.match(runner.slice(activity, decision), /undefined, agentId\)/)
})

test('the exam runner reads academic evidence for the learner it was invoked for', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersExamRunner.ts')
  assert.match(runner, /readCosUniversityMastersEvidence\(programId, agentId\)/)
})

test('the bound specialist exam writes academic evidence for the same learner before reporting completion', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersExamRunner.ts')
  const start = runner.indexOf('async function executeBoundRun(')
  const end = runner.indexOf('async function executeRun(', start + 1)
  assert.ok(start > 0 && end > start, 'bound Master’s execution function is missing')
  const bound = runner.slice(start, end)

  const binding = bound.indexOf('boundExecutionBindingFailure(bound.reply, execution)')
  const evidence = bound.indexOf('recordHostCosUniversityMastersEvidence({')
  const returned = bound.lastIndexOf('return summary({')
  assert.ok(binding > 0 && evidence > binding, 'academic evidence must follow exact reply/execution binding')
  assert.ok(returned > evidence, 'bound run must not report completion before evidence is recorded')
  assert.match(bound, /recordHostCosUniversityMastersEvidence\(\{\s*\n\s*agentId,/)
  assert.match(bound, /evidenceKey: `masters-exam:\$\{row\.id\}`/)
  assert.match(bound, /authority: cosUniversityMastersExpectedAuthority\(target\.stage\)/)
  assert.match(bound, /if \(!evidenceRecorded\) return fail\(\['masters_evidence_not_recorded'\]\)/)
  assert.match(bound, /evidenceRecorded,/)
  assert.match(bound, /turnId: execution\.turnId/)
})

test('bound coursework completion requires both a passing score and persisted academic evidence', () => {
  const runner = file('lib/ai/cos/cosUniversityMastersExamRunner.ts')
  const start = runner.indexOf('async function executeBoundRun(')
  const end = runner.indexOf('async function executeRun(', start + 1)
  const bound = runner.slice(start, end)
  assert.match(bound, /courseworkPlanId: string \| null/)
  assert.match(bound, /if \(courseworkPlanId && score\.passed\) await markCourseworkPlanComplete\(courseworkPlanId\)/)
  assert.match(runner, /executeBoundRun\(row, target, agentId, exam, courseworkPlanId, started\)/)
})

test('the COS-only practical-evidence lane stays internally consistent', () => {
  // Not a defect: it scopes its own enrollment query to COS too. Making that lane multi-agent is
  // separate work, and this test exists so the two are not confused for each other.
  for (const relative of COS_ONLY_MODULES) {
    const source = file(relative)
    assert.match(source, /const AGENT_ID = 'cos'/)
    assert.match(source, /\.eq\('agent_id', AGENT_ID\)/)
    for (const call of runtimeStatusCalls(source)) {
      assert.ok(!call.includes('agentId'), `${relative} now names an agent; move it to the scoped list`)
    }
  }
})
