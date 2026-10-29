import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { releasableAnalyticalAnswer } from '../lib/ai/cos/answerTaskContract.ts'

test('analytical release refuses missing task despite repeated topical prose', () => {
  const request = '1. Diagnose the primary cause.\n2. Rank the alternative causes.\n3. Propose discriminating experiments.'
  const response = 'Primary cause, alternative causes, discriminating experiments. '.repeat(70)
  assert.equal(releasableAnalyticalAnswer(request, response), false)
})

test('release guard never grants bypass for missing requested deliverables', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/answerTaskContract.ts'), 'utf8')
  const block = source.slice(source.indexOf('export function releasableAnalyticalAnswer'), source.indexOf('export function analyticalTaskRepairDirective'))
  assert.match(block, /if \(missing\.length\) return false/)
})
