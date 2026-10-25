import assert from 'node:assert/strict'
import test from 'node:test'
import { detectConciergeVisualIntent, extractNamedPeople, isConciergeVisualObjective } from '../lib/visuals/intent.ts'

const REPORTED_PROMPT = 'create an imaage with President Trump and President Lula holding hands'

test('the exact reported misspelling still routes to named-person image generation', () => {
  assert.equal(isConciergeVisualObjective(REPORTED_PROMPT), true)
  assert.deepEqual(extractNamedPeople(REPORTED_PROMPT), [
    'Donald Trump',
    'Luiz Inácio Lula da Silva',
  ])
  assert.deepEqual(detectConciergeVisualIntent(REPORTED_PROMPT), {
    filename: 'donald-trump-luiz-inacio-lula-da-silva-illustration.png',
    mode: 'reference-people',
    referencePeople: ['Donald Trump', 'Luiz Inácio Lula da Silva'],
  })
})

test('bounded visual typo correction covers insertion deletion substitution and transposition', () => {
  const prompts = [
    'create an imaage of a blue circle',
    'create an imag of a blue circle',
    'create an imqge of a blue circle',
    'create an imgae of a blue circle',
    'cretae an image of a blue circle',
    'crie uma imgaem de um círculo azul',
  ]

  for (const prompt of prompts) {
    assert.equal(isConciergeVisualObjective(prompt), true, prompt)
  }
})

test('a misspelled mark noun keeps the verified-reference classifier', () => {
  assert.deepEqual(detectConciergeVisualIntent('draw the Palmeiras logoo'), {
    filename: 'palmeiras-mark.png',
    mode: 'reference-mark',
    referenceQuery: 'palmeiras',
  })
})

test('typo tolerance does not turn ordinary political or writing prompts into image requests', () => {
  const ordinaryPrompts = [
    'Who are President Trump and President Lula?',
    'President Trump and President Lula are holding hands in this paragraph.',
    'create an email with President Trump and President Lula in the subject line',
    'make an impact assessment about President Trump and President Lula',
    'compare President Trump and President Lula',
  ]

  for (const prompt of ordinaryPrompts) {
    assert.equal(isConciergeVisualObjective(prompt), false, prompt)
    assert.equal(detectConciergeVisualIntent(prompt), null, prompt)
  }
})

// Production 2026-10-25: an incident-analysis brief got "I could not verify an authoritative image of that mark".
// "Logs are sampled at 10%" was typo-corrected to "logo", dozens of words away from "create" and "design".
test('a picture word far from any drawing verb does not make a text request visual', async () => {
  const { readFileSync } = await import('node:fs')
  const brief = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')
  assert.equal(isConciergeVisualObjective(brief), false)
  assert.equal(detectConciergeVisualIntent(brief), null)
  for (const prompt of [
    'Do not create files. Check whether the logs are sampled at 10 percent and design an experiment for each hypothesis about the duplicate charges.',
    'Generate a summary of the outage. Our monitoring dashboard shows the icon turning red during the deploy window every night.',
  ]) assert.equal(isConciergeVisualObjective(prompt), false, prompt)
  for (const prompt of [
    'create a modern minimalist logo for my bakery',
    'generate a high quality photo realistic image of a lighthouse at dusk',
    'design a coat of arms for the Silva family',
  ]) assert.equal(isConciergeVisualObjective(prompt), true, prompt)
  // Codex on #4875: a far misspelled mark under a drawing verb keeps verified-reference lookup, and a text
  // deliverable about an image stays text.
  assert.equal(detectConciergeVisualIntent('draw the official manchester united logoo')?.mode, 'reference-mark')
  assert.equal(isConciergeVisualObjective('make a summary of this image.'), false)
})
