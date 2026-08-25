import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  conciergePromptWithScenarioRule,
  shouldClarifyUserSuppliedScenario,
} from '../lib/homepageConciergePolicy.ts'

const source = readFileSync(new URL('../lib/homepageConciergePolicy.ts', import.meta.url), 'utf8')

test('homepage concierge policy stays browser-safe and does not import server COS request context', () => {
  assert.doesNotMatch(source, /from\s+['"]\.\/ai\/cos\//)
  assert.doesNotMatch(source, /node:async_hooks/)
  assert.doesNotMatch(source, /cosArtifactConversationContext/)
})

test('browser-safe transformation guard preserves edit requests without scenario-prefix contamination', () => {
  for (const prompt of [
    'edit - Our company email needs to be clearer before I send it to the customer.',
    'Please rewrite this company note so it sounds more professional: the vendor replied late.',
    'edite - Nossa empresa precisa responder ao fornecedor de forma mais clara.',
    'edytuj - Nasza firma musi poprawić wiadomość do klienta przed wysłaniem.',
  ]) {
    assert.equal(shouldClarifyUserSuppliedScenario(prompt), false, prompt)
    assert.equal(conciergePromptWithScenarioRule(prompt), prompt, prompt)
  }
})

test('ordinary supplied business scenarios still receive the premise rule', () => {
  const prompt = 'The company has 8 months of runway and the CFO wants to cut inference costs. Analyze the trade-off and recommend a plan.'
  assert.equal(shouldClarifyUserSuppliedScenario(prompt), true)
  assert.match(conciergePromptWithScenarioRule(prompt), /CURRENT-REQUEST PREMISE RULE:/)
})
