// saas/tests/conciergeSemanticVisualIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectConciergeVisualIntent, hasVisualActionToken, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { isSemanticVisualRequest } from '../lib/visuals/semanticIntent.ts'
import { readRepoFile, requireWiring } from './helpers/requiredWiring.ts'

const reasoner = (verdict: unknown, seen?: string[]) => (async (args: any) => {
  seen?.push(String(args?.prompt || ''))
  return { text: JSON.stringify(verdict), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

// PR #1939 made draw/sketch/paint/illustrate self-sufficient verbs, so the exact
// production prompt is now admitted deterministically and never reaches the
// semantic classifier. This pins that outcome directly.
test('the exact production prompt routes to the visual generator deterministically', async () => {
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(isConciergeVisualObjective(prompt), true)
  assert.deepEqual(detectConciergeVisualIntent(prompt), { filename: 'visual.png', mode: 'generate' })
  // The route consults the network only when the fast path declined, so a prompt
  // the deterministic list already accepts still costs no model call.
  const route = await readRepoFile('app/api/cos-browser/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Consult the semantic classifier only when the deterministic list declined, so an accepted prompt costs no model call.',
    expect: /isConciergeVisualObjective\(prompt\) \? false : await isSemanticVisualRequest\(prompt\)/,
    insert: '    const semanticVisual = isConciergeVisualObjective(prompt) ? false : await isSemanticVisualRequest(prompt)',
    after: '    // this identical gate, so Concierge and the owner Assistant draw alike.',
    requiresImport: "import { isSemanticVisualRequest } from '@/lib/visuals/semanticIntent'",
  })
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

// The word list no longer gates entry to the network, so inflected and
// pronoun-attached forms that no constant will ever enumerate are judged on
// meaning. Every prompt below is invisible to the deterministic verb list.
test('inflected phrasings the verb list cannot enumerate reach the network and are admitted', async () => {
  for (const prompt of [
    'narysujcie statek kosmiczny',
    'czy mozesz narysowac statek kosmiczny?',
    'naszkicuj dwoje dzieci grajacych w pilke',
    'dibujame dos ninos jugando al futbol bajo la lluvia',
    'puedes dibujarme una nave espacial?',
    'mozhesh narisovat kosmicheskiy korabl?',
  ]) {
    assert.equal(hasVisualActionToken(prompt), false, prompt)
    assert.equal(isConciergeVisualObjective(prompt), false, prompt)
    assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: true })), true, prompt)
    assert.deepEqual(detectConciergeVisualIntent(prompt, { semanticVisual: true }), { filename: 'visual.png', mode: 'generate' }, prompt)
  }
})

// Removing the verb precondition moves the whole safety burden onto the verdict.
// A negative verdict must still refuse, including for prompts that carry no
// drawing verb at all and would previously have been refused by the list.
test('a negative verdict refuses, with or without a drawing verb', async () => {
  for (const prompt of [
    'what is the weather in Merida today',
    'create a go-to-market strategy for Q4',
    'podsumuj ten raport kwartalny',
    'resume este informe trimestral',
  ]) {
    assert.equal(await isSemanticVisualRequest(prompt, reasoner({ depictable_image: false })), false, prompt)
    assert.equal(detectConciergeVisualIntent(prompt, { semanticVisual: false }), null, prompt)
  }
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
  const route = await readRepoFile('app/api/cos-browser/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Forward the semantic verdict to the visuals route so it can admit a request that named no picture-noun.',
    expect: /semanticVisual/,
    insert: "      body: JSON.stringify({ objective: prompt, semanticVisual })",
    after: '      headers.delete(\'content-length\')',
    requiresImport: "import { isSemanticVisualRequest } from '@/lib/visuals/semanticIntent'",
  })
  const visuals = await readRepoFile('app/api/visuals/route.ts')
  requireWiring(visuals, {
    file: 'saas/app/api/visuals/route.ts',
    purpose: 'Honour the forwarded semantic verdict and the filtered people list when detecting intent.',
    expect: /detectConciergeVisualIntent\(objective, \{ semanticVisual, realPeople \}\)/,
    insert: '    const intent = detectConciergeVisualIntent(objective, { semanticVisual, realPeople })',
    after: '    const realPeople = await filterRealPeople(objective, extractNamedPeople(objective))',
  })
})
