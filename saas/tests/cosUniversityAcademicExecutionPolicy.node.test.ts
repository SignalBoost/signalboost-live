import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE,
  cosUniversityAcademicExecutionBlocker,
} from '../lib/ai/cos/cosUniversityAcademicExecutionPolicy.ts'

const file = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8')

test('only COS has a bound academic executor; every other agent fails closed', () => {
  assert.equal(cosUniversityAcademicExecutionBlocker('cos'), null)
  assert.equal(cosUniversityAcademicExecutionBlocker('software-specialist'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('any-future-agent'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('  '), 'agent_id_required')
})

const RUNNERS: Array<{ file: string; blockAt: RegExp; firstWork: string }> = [
  { file: 'lib/ai/cos/cosUniversityIndependentExamRunner.ts', blockAt: /if \(blocked\) return \{ enabled: true, blocked, attempted: 0/, firstWork: 'loadAssessmentRows(agentId)' },
  { file: 'lib/ai/cos/cosUniversityARangeRunner.ts', blockAt: /if \(blocked\) \{\s*return \{\s*enabled: true, blocked,/, firstWork: 'assessments = await loadAssessmentRows(agentId)' },
  { file: 'lib/ai/cos/cosUniversityLanguageARangeRunner.ts', blockAt: /if \(blocked\) \{\s*return \{\s*enabled: true, blocked,/, firstWork: 'assessments = await loadAssessmentRows(agentId)' },
  { file: 'lib/ai/cos/cosUniversityRetentionRunner.ts', blockAt: /if \(blocked\) return \{ enabled: true, agentId, attempted: 0, status: 'blocked', blocked \}/, firstWork: "db.from('cos_university_a_range_runs')" },
]

test('every credit-bearing runner that answers through the COS reasoner blocks other agents before any evidence work', () => {
  for (const runner of RUNNERS) {
    const source = file(runner.file)
    assert.match(source, /tryCOSFirstAnswer\(/, `${runner.file} still answers through the COS reasoner`)
    assert.match(source, /cosUniversityAcademicExecutionBlocker\(agentId\)/, `${runner.file} must consult the execution policy`)
    const blockMatch = runner.blockAt.exec(source)
    assert.ok(blockMatch, `${runner.file} must return a blocked result`)
    const workAt = source.indexOf(runner.firstWork, source.indexOf('cosUniversityAcademicExecutionBlocker(agentId)'))
    assert.ok(workAt > blockMatch.index, `${runner.file} must block before loading or creating academic evidence`)
    const ends = [source.indexOf('semantics:', blockMatch.index), source.indexOf('blocked }', blockMatch.index)].filter(at => at > 0)
    const blockedReturn = source.slice(blockMatch.index, Math.min(...ends))
    assert.doesNotMatch(blockedReturn, /errors: \[['"]/, 'a policy block is an explicit outcome, not a lane failure')
  }
})

test('language A-range keeps agent-tagged verified Production evidence but blocks COS-answered exams', () => {
  const source = file('lib/ai/cos/cosUniversityLanguageARangeRunner.ts')
  const bridgeAt = source.indexOf('await syncVerifiedLanguageProductionOutcomes(agentId, now)')
  const blockAt = source.indexOf('const blocked = cosUniversityAcademicExecutionBlocker(agentId)')
  assert.ok(bridgeAt > 0 && blockAt > bridgeAt, 'the Production bridge runs before the exam block')
})
