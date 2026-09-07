import assert from 'node:assert/strict'
import test from 'node:test'
import { detectConciergeVisualIntent, isConciergeVisualObjective } from '../lib/visuals/intent.ts'

test('Concierge routes a bare draw request to visual generation', () => {
  const prompt = 'draw 2 kids playing football in the rain'
  assert.equal(isConciergeVisualObjective(prompt), true)
  assert.equal(detectConciergeVisualIntent(prompt)?.mode, 'generate')
})

test('unambiguous visual verbs do not require an image noun', () => {
  for (const prompt of [
    'sketch a rainy football match',
    'illustrate a cat under an umbrella',
    'desenhe duas crianças jogando futebol na chuva',
    'dibuja dos niños jugando fútbol bajo la lluvia',
    'narysuj dwoje dzieci grających w piłkę w deszczu',
    'нарисуй двух детей, играющих в футбол под дождем',
  ]) {
    assert.equal(isConciergeVisualObjective(prompt), true, prompt)
  }
})

test('generic creation verbs remain guarded by an explicit visual subject', () => {
  for (const prompt of ['create an account', 'make a campaign', 'design a database', 'render this component']) {
    assert.equal(isConciergeVisualObjective(prompt), false, prompt)
  }

  assert.equal(isConciergeVisualObjective('create an image of a rainy football match'), true)
})
