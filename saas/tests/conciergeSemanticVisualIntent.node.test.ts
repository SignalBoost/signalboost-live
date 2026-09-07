// saas/tests/conciergeSemanticVisualIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectConciergeVisualIntent, hasVisualActionToken, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { isSemanticVisualRequest } from '../lib/visuals/semanticIntent.ts'

const reasoner = (verdict: unknown, seen?: string[]) => (async (args: any) => {
  seen?.push(String(args?.prompt || ''))
  return { text: JSON.stringify(verdict), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

// PR #1939 made draw/sketch/paint/illustrate self-sufficient verbs, so the exact
// production prompt is now admitted deterministically and never reaches the
// semantic classifier. This pins that outcome directly.
test('the exact production prompt routes to the visual generator with no model call', async () => {
  const prompt = 'draw 2 kids playing football in the rain'
  const seen: string[] = []
  assert.equal(isConciergeVisualObjective(prompt), true)
  assert.deepEqual(detectConciergeVisualIntent(prompt), { filename: 'visual.png', mode: 'generate' })
  await isSemanticVisualRequest('what is 2 + 2', reasoner({ depictable_image: true }, seen))
  assert.deepEqual(seen, [])
})

// The verb list closes the draw/paint family. It cannot close the generic verbs,
// because create/make/design/generate are used for text work just as often as for
// pictures — the deliverable, not the verb, decides. That is the gap the semantic
// classifier covers.
test('a generic verb with a depictable subject is admitted only semantically', async () => {
  for (const prompt of [
    'create a golden retriever wearing sunglasses on a skateboard',
    'make me a cozy cabin in a snowstorm at dusk',
    'design a robot barista serving coffee',
    'generate a golden retriever wearing sunglasses',
  ]) {
    assert.equal(isConciergeVisualObjective(prompt), false, prompt)
    assert.equal(detectConciergeVisualIntent(prompt), null, prompt)
    assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: true })), true, prompt)
    assert.deepEqual(detectConciergeVisualIntent(prompt, { semanticVisual: true }), { filename: 'visual.png', mode: 'generate' }, prompt)
  }
})

test('the self-sufficient verbs work across all five platform languages', () => {
  for (const prompt of [
    'draw 2 kids playing football in the rain',
    'paint a sunset over the ocean',
    'narysuj statek kosmiczny',
    'dibuja una nave espacial',
    'нарисуй космический корабль',
  ]) {
    assert.equal(hasVisualActionToken(prompt), true, prompt)
    assert.notEqual(detectConciergeVisualIntent(prompt), null, prompt)
  }
})

test('ordinary work keeping the same generic verbs is never turned into a picture', async () => {
  for (const prompt of [
    'create a go-to-market strategy for Q4',
    'design a database schema for orders and invoices',
    'make a list of the open incidents',
    'generate a weekly status report',
  ]) {
    assert.equal(isConciergeVisualObjective(prompt), false, prompt)
    assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: false })), false, prompt)
    assert.equal(detectConciergeVisualIntent(prompt, { semanticVisual: false }), null, prompt)
  }
})

test('a semantic verdict can never admit a request that has no drawing verb', async () => {
  const prompt = 'what is the weather in Merida today'
  assert.equal(hasVisualActionToken(prompt), false)
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: true })), false)
  assert.equal(detectConciergeVisualIntent(prompt, { semanticVisual: true }), null)
})

test('the classifier fails closed on outage, junk and malformed verdicts', async () => {
  const prompt = 'create a golden retriever wearing sunglasses on a skateboard'
  assert.equal(await isSemanticVisualRequest(prompt, offline), false)
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: 'yes' })), false)
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({})), false)
  assert.equal(await isSemanticVisualRequest('', reasoner({ depictable_image: true })), false)
  assert.equal(await isSemanticVisualRequest(`create ${'x'.repeat(500)}`, reasoner({ depictable_image: true })), false)
})

test('the browser ingress uses the semantic gate and forwards its verdict', async () => {
  const fs = await import('node:fs/promises')
  const route = await fs.readFile('app/api/cos-browser/route.ts', 'utf8')
  assert.match(route, /isSemanticVisualRequest/)
  assert.match(route, /semanticVisual/)
  const visuals = await fs.readFile('app/api/visuals/route.ts', 'utf8')
  assert.match(visuals, /detectConciergeVisualIntent\(objective, \{ semanticVisual \}\)/)
})
