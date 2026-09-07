// saas/tests/namedSubjectIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectConciergeVisualIntent, extractNamedPeople } from '../lib/visuals/intent.ts'
import { filterRealPeople } from '../lib/visuals/namedSubjectIntent.ts'
import { readRepoFile, requireWiring } from './helpers/requiredWiring.ts'

const reasoner = (people: unknown, seen?: string[]) => (async (args: any) => {
  seen?.push(String(args?.prompt || ''))
  return { text: JSON.stringify({ people }), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

// The exact production failure: a vessel and a landmark were classified as people,
// sent to verified-reference lookup, and refused as an "unresolved person".
test('capitalisation alone still proposes non-people — that is the defect', () => {
  assert.deepEqual(extractNamedPeople("draw Noah's Ark"), ["Noah's Ark"])
  assert.deepEqual(extractNamedPeople('draw the Eiffel Tower'), ['Eiffel Tower'])
})

test('the network removes the non-people and the request becomes ordinary generation', async () => {
  for (const prompt of [
    "Noah's Ark",
    "draw Noah's Ark",
    "draw Noah's Ark - Noah's Ark is the massive vessel from the biblical Genesis flood narrative",
    'draw the Eiffel Tower',
  ]) {
    const realPeople = await filterRealPeople(prompt, extractNamedPeople(prompt), reasoner([]))
    assert.deepEqual(realPeople, [], prompt)
    assert.deepEqual(detectConciergeVisualIntent(prompt, { semanticVisual: true, realPeople }), { filename: 'visual.png', mode: 'generate' }, prompt)
  }
})

test('a real person is still routed to verified-reference lookup', async () => {
  const prompt = 'draw a picture of Donald Trump'
  const candidates = extractNamedPeople(prompt)
  assert.deepEqual(candidates, ['Donald Trump'])
  const realPeople = await filterRealPeople(prompt, candidates, reasoner(['Donald Trump']))
  assert.deepEqual(realPeople, ['Donald Trump'])
  assert.equal(detectConciergeVisualIntent(prompt, { realPeople })?.mode, 'reference-people')
})

// The filter may only narrow the proposal. It can never introduce a subject, so it
// cannot cause an unverified likeness to be generated.
test('the model cannot add a person that was never proposed', async () => {
  const prompt = "draw Noah's Ark"
  const realPeople = await filterRealPeople(prompt, extractNamedPeople(prompt), reasoner(['Barack Obama', "Noah's Ark"]))
  assert.deepEqual(realPeople, ["Noah's Ark"])
})

// Failing SAFE, not open: an outage keeps verification mandatory rather than silently
// generating a real likeness without a reference.
test('outage, malformed output and junk keep the candidates and today behaviour', async () => {
  const prompt = 'draw a picture of Donald Trump'
  const candidates = extractNamedPeople(prompt)
  assert.deepEqual(await filterRealPeople(prompt, candidates, offline), ['Donald Trump'])
  assert.deepEqual(await filterRealPeople(prompt, candidates, reasoner('not-an-array')), ['Donald Trump'])
  assert.deepEqual(await filterRealPeople(prompt, candidates, (async () => ({ text: 'no json here' })) as any), ['Donald Trump'])
  assert.deepEqual(await filterRealPeople(`x${'y'.repeat(700)}`, candidates, reasoner([])), ['Donald Trump'])
})

test('no candidates means no model call at all', async () => {
  const seen: string[] = []
  assert.deepEqual(await filterRealPeople('design two kids playing football in the rain', [], reasoner([], seen)), [])
  assert.deepEqual(seen, [])
})

test('the visuals route filters candidates before intent detection', async () => {
  const route = await readRepoFile('app/api/visuals/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/visuals/route.ts',
    purpose: 'Filter the orthographic people guess semantically so a vessel or landmark is not refused as an unresolved person.',
    expect: /const realPeople = await filterRealPeople\(objective, extractNamedPeople\(objective\)\)/,
    insert: '    const realPeople = await filterRealPeople(objective, extractNamedPeople(objective))',
    after: "    const semanticVisual = (body as { semanticVisual?: unknown })?.semanticVisual === true",
    requiresImport: "import { filterRealPeople } from '@/lib/visuals/namedSubjectIntent'",
  })
  requireWiring(route, {
    file: 'saas/app/api/visuals/route.ts',
    purpose: 'Pass the filtered people list into intent detection so it overrides the capitalisation guess.',
    expect: /detectConciergeVisualIntent\(objective, \{ semanticVisual, realPeople \}\)/,
    insert: '    const intent = detectConciergeVisualIntent(objective, { semanticVisual, realPeople })',
    after: '    const realPeople = await filterRealPeople(objective, extractNamedPeople(objective))',
    requiresImport: "import { extractNamedPeople, detectConciergeVisualIntent } from '@/lib/visuals/intent'",
  })
})
