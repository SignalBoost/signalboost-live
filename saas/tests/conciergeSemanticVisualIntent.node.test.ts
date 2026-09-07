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

test('the exact production prompt carries a drawing verb but no picture-noun', () => {
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(isConciergeVisualObjective(prompt), false)
  assert.equal(hasVisualActionToken(prompt), true)
  assert.equal(detectConciergeVisualIntent(prompt), null)
})

test('a semantic verdict admits it and produces a real generate intent', async () => {
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: true })), true)
  assert.deepEqual(detectConciergeVisualIntent(prompt, { semanticVisual: true }), { filename: 'visual.png', mode: 'generate' })
})

test('subjects no noun list would ever contain are admitted the same way', async () => {
  for (const prompt of [
    'draw 2 kids playing football in the rain',
    'paint a sunset over the ocean',
    'narysuj statek kosmiczny',
    'dibuja una nave espacial',
    'нарисуй космический корабль',
  ]) {
    assert.equal(hasVisualActionToken(prompt), true, prompt)
    assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: true })), true, prompt)
    assert.notEqual(detectConciergeVisualIntent(prompt, { semanticVisual: true }), null, prompt)
  }
})

test('ordinary work keeping the same verbs is never turned into a picture', async () => {
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
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(await isSemanticVisualRequest(prompt, offline), false)
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: 'yes' })), false)
  assert.equal(await isSemanticVisualRequest(prompt, reasoner({})), false)
  assert.equal(await isSemanticVisualRequest('', reasoner({ depictable_image: true })), false)
  assert.equal(await isSemanticVisualRequest(`draw ${'x'.repeat(500)}`, reasoner({ depictable_image: true })), false)
})

test('an already-admitted request never spends a model call', async () => {
  const seen: string[] = []
  assert.equal(isConciergeVisualObjective('draw me a picture of a spaceship'), true)
  await isSemanticVisualRequest('what is 2 + 2', reasoner({ depictable_image: true }, seen))
  assert.deepEqual(seen, [])
})

test('the browser ingress uses the semantic gate and forwards its verdict', async () => {
  const route = await import('node:fs/promises').then(fs => fs.readFile('app/api/cos-browser/route.ts', 'utf8'))
  assert.match(route, /isSemanticVisualRequest/)
  assert.match(route, /semanticVisual/)
  const visuals = await import('node:fs/promises').then(fs => fs.readFile('app/api/visuals/route.ts', 'utf8'))
  assert.match(visuals, /detectConciergeVisualIntent\(objective, \{ semanticVisual \}\)/)
})
