// saas/tests/visualPromptFormatNeutrality.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

const route = await import('node:fs/promises').then(fs => fs.readFile('app/api/visuals/route.ts', 'utf8'))
const prompt = route.slice(route.indexOf('function visualPrompt('), route.indexOf('function peopleVisualPrompt('))

// The reported defect: "draw 2 kids playing football in the rain" came back as a circular
// crest with a lettered ring, because the house prompt told EVERY request to use a centered
// graphic-design composition for logos and badges. Format is the request's to choose.
test('the house prompt never instructs a badge or emblem composition', () => {
  assert.doesNotMatch(prompt, /use a clean centered graphic-design composition/i)
  assert.match(prompt, /Never impose a centered badge, emblem, roundel, crest, or logo composition on a request that did not ask for one/)
  assert.match(prompt, /Let the request itself decide the visual format/)
})

test('the house prompt names no format as the default and adds no lettering by default', () => {
  // Every format may be MENTIONED as an option, but none may be prescribed.
  assert.doesNotMatch(prompt, /For an original logo, badge, emblem/i)
  assert.doesNotMatch(prompt, /For a diagram, favor/i)
  assert.match(prompt, /Add lettering only if the request asks for it/)
})

// The anti-fabrication and privacy lines are load-bearing and must survive the change.
test('the safety instructions are preserved', () => {
  assert.match(prompt, /Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark from model memory/)
  assert.match(prompt, /For unnamed people or animals, use an original, non-identifiable depiction/)
  assert.match(prompt, /no watermarks/)
})

// Variation is owned by freshGeneration (PR #1946); this file must not duplicate or fight it.
test('format neutrality does not restate the fresh-variation contract', () => {
  assert.doesNotMatch(prompt, /variation|seed|different composition each time/i)
})
