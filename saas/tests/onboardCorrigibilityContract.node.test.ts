import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const onboard = fs.readFileSync(path.join(import.meta.dirname, '../../ONBOARD.md'), 'utf8')

test('ONBOARD makes corrigibility a platform invariant', () => {
  assert.match(onboard, /Agent corrigibility and evidence-discipline invariant/)
  assert.match(onboard, /A mistake is not itself a governance or Safety violation/)
  assert.match(onboard, /observation[\s\S]*bounded claim[\s\S]*hypothesis[\s\S]*discriminating test[\s\S]*verified conclusion/)
  assert.match(onboard, /Contradiction is a learning event/)
  assert.match(onboard, /Correction does not widen authority/)
  assert.match(onboard, /Learning is general, not answer leakage/)
  assert.match(onboard, /Retesting must demonstrate transfer/)
})

test('ONBOARD forbids stronger completion claims than evidence supports', () => {
  assert.match(onboard, /merged PR proves merge/)
  assert.match(onboard, /READY deployment proves deployment readiness/)
  assert.match(onboard, /none alone proves Production functionality or end-to-end completion/)
  assert.match(onboard, /must not label work .*fixed.*root cause.*healthy.*Production-ready.*complete.*working end to end.* beyond the strongest evidence actually observed/)
})
