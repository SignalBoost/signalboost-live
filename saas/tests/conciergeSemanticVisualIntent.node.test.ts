// saas/tests/conciergeSemanticVisualIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectConciergeVisualIntent, hasVisualActionToken, isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { isSemanticVisualRequest, resolveSemanticVisualRequest } from '../lib/visuals/semanticIntent.ts'
import { readRepoFile, requireWiring } from './helpers/requiredWiring.ts'

const reasoner = (verdict: unknown, seen?: string[]) => (async (args: any) => {
  seen?.push(String(args?.prompt || ''))
  return { text: JSON.stringify(verdict), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

test('the exact production prompt routes to the visual generator deterministically', async () => {
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(isConciergeVisualObjective(prompt), true)
  assert.deepEqual(detectConciergeVisualIntent(prompt), { filename: 'visual.png', mode: 'generate' })
  const route = await readRepoFile('app/api/cos-browser/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Keep explicit visual requests on the zero-cost fast path while semantic ambiguity uses the deep conversation classifier.',
    expect: /const directVisual = isConciergeVisualObjective\(prompt\)/,
    insert: '    const directVisual = isConciergeVisualObjective(prompt)',
    after: '    // ambiguous — including follow-up language — is decided by the deep semantic reasoner',
    requiresImport: "import { resolveSemanticVisualRequest } from '@/lib/visuals/semanticIntent'",
  })
})

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

test('conversation follow-ups are resolved semantically from recent user context', async () => {
  const messages = [
    { role: 'user', content: 'design a new logo for iTMounts' },
    { role: 'assistant', content: 'first version' },
    { role: 'user', content: 'do something better than that' },
  ]
  const seen: string[] = []
  const result = await resolveSemanticVisualRequest(
    messages,
    'do something better than that',
    reasoner({ visual_request: true, anchor_user_turn: 0 }, seen),
  )
  assert.ok(result)
  assert.equal(result.continuation, true)
  assert.match(result.objective, /design a new logo for iTMounts/)
  assert.match(result.objective, /do something better than that/)
  assert.match(seen[0] || '', /RECENT USER TURNS:/)
})

test('the browser ingress uses semantic conversation continuity without disabling direct visual fallback', async () => {
  const route = await readRepoFile('app/api/cos-browser/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Preserve active visual conversation context even when the current follow-up is directly depictable.',
    expect: /const shouldResolveVisualContext = !directVisual \|\| userMessages\.length > 1[\s\S]*?await resolveSemanticVisualRequest\(messages, prompt\)/,
    insert: '    const shouldResolveVisualContext = !directVisual || userMessages.length > 1',
    after: '    const directVisual = isConciergeVisualObjective(prompt)',
    requiresImport: "import { resolveSemanticVisualRequest } from '@/lib/visuals/semanticIntent'",
  })
  assert.match(route, /const visualObjective = semanticResolution\?\.objective \?\? \(directVisual \? prompt : null\)/)
  assert.match(route, /const semanticVisual = Boolean\(semanticResolution\)/)
  assert.match(route, /body: JSON\.stringify\(\{ objective: visualObjective, semanticVisual \}\)/)
  assert.doesNotMatch(route, /const semanticResolution = directVisual \? null : await resolveSemanticVisualRequest/)

  const visuals = await readRepoFile('app/api/visuals/route.ts')
  requireWiring(visuals, {
    file: 'saas/app/api/visuals/route.ts',
    purpose: 'Honour the forwarded semantic verdict and the filtered people list when detecting intent.',
    expect: /detectConciergeVisualIntent\(objective, \{ semanticVisual, realPeople \}\)/,
    insert: '    const intent = detectConciergeVisualIntent(objective, { semanticVisual, realPeople })',
    after: '    const realPeople = await filterRealPeople(objective, extractNamedPeople(objective))',
  })
})
