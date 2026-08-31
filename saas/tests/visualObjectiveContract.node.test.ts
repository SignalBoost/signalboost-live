import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MAX_VISUAL_OBJECTIVE_CHARS,
  VisualObjectiveError,
  readVisualObjective,
} from '../lib/visuals/request-contract.ts'

const route = readFileSync(new URL('../app/api/visuals/route.ts', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../lib/visuals/request-contract.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const gates = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('visual objective limit matches the user-facing 8,000-character Concierge composer', () => {
  assert.equal(MAX_VISUAL_OBJECTIVE_CHARS, 8_000)
  assert.match(home, /maxLength=\{?8000\}?/)
  assert.equal(readVisualObjective({ objective: `Create an image. ${'x'.repeat(3_984)}` }).length, 4_001)
  assert.equal(readVisualObjective({ objective: `Create an image. ${'x'.repeat(7_983)}` }).length, 8_000)
})

test('visual requests accept supported direct and message envelopes', () => {
  assert.deepEqual(readVisualObjective({ objective: 'Create an image of a lighthouse.' }), {
    objective: 'Create an image of a lighthouse.',
    source: 'objective',
    length: 32,
  })
  assert.equal(readVisualObjective({ prompt: 'Sketch a rainy street.' }).source, 'prompt')
  assert.equal(readVisualObjective({ input: 'Draw a simple diagram.' }).source, 'input')
  assert.deepEqual(readVisualObjective({
    messages: [
      { role: 'user', content: 'old prompt' },
      { role: 'assistant', content: 'old reply' },
      { role: 'user', content: [{ type: 'text', text: 'Create a colorful office diagram.' }] },
    ],
  }), {
    objective: 'Create a colorful office diagram.',
    source: 'messages',
    length: 33,
  })
})

test('missing and oversized visual objectives fail precisely', () => {
  assert.throws(
    () => readVisualObjective({}),
    (error: unknown) => error instanceof VisualObjectiveError
      && error.code === 'visual_objective_required'
      && error.source === null,
  )

  assert.throws(
    () => readVisualObjective({ objective: 'x'.repeat(MAX_VISUAL_OBJECTIVE_CHARS + 1) }),
    (error: unknown) => error instanceof VisualObjectiveError
      && error.code === 'visual_objective_too_large'
      && error.observedLength === MAX_VISUAL_OBJECTIVE_CHARS + 1,
  )
})

test('visual route removes the opaque legacy failure and logs only safe dimensions', () => {
  assert.match(route, /readVisualObjective\(body\)/)
  assert.match(route, /isVisualObjectiveError\(error\)/)
  assert.match(route, /\[visual_objective_rejected\]/)
  assert.match(route, /observedLength: error\.observedLength/)
  assert.match(route, /maxLength: error\.maxLength/)
  assert.match(contract, /visual_objective_required/)
  assert.match(contract, /visual_objective_too_large/)
  assert.doesNotMatch(route, /visual_invalid_objective/)
  assert.doesNotMatch(contract, /visual_invalid_objective/)
  assert.doesNotMatch(route, /console\.(?:warn|error)[\s\S]{0,160}(?:objective|prompt):\s*objective/)
})

test('visual request contract is mandatory in the deployment gate', () => {
  assert.match(gates, /tests\/visualObjectiveContract\.node\.test\.ts/)
})
