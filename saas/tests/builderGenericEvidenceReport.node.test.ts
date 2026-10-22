import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
test('published Builder projects always use host evidence reports, regardless of project name', () => {
  assert.match(source, /const wantsAcceptanceReport = requiresPublication \|\|/)
  assert.doesNotMatch(source, /const wantsAcceptanceReport = \/\(\?:Calculator API/)
  assert.match(source, /acceptanceReport \? historyReply\(acceptanceReport/)
})
test('nonpublication jobs do not automatically require the publication report', () => {
  const wants = (requiresPublication: boolean, objective: string) =>
    requiresPublication || /\b(?:final acceptance report|end-to-end acceptance test)\b/i.test(objective)
  assert.equal(wants(false, 'Explain how to use Node.js'), false)
  assert.equal(wants(true, 'Publish a new isolated Python application'), true)
  assert.equal(wants(false, 'Provide final acceptance report for my existing task'), true)
})
