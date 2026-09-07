// saas/tests/conciergeLanguageAcceptance.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ACCEPTANCE_LANGUAGES,
  CONCIERGE_LANGUAGE_ACCEPTANCE_CASES,
  evaluateLanguageAcceptanceText,
  hasEnglishLeakage,
  selectedLanguageSignal,
} from '../lib/ai/cos/conciergeLanguageAcceptance.ts'
import { getConciergeAnswer } from '../lib/platform/unifiedPlatform.ts'

const read = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('acceptance matrix contains exactly five distinct categories for each supported language', () => {
  assert.equal(CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.length, 25)
  const expected = ['conversation','fallback','operational','reasoning','transformation']
  for (const language of ACCEPTANCE_LANGUAGES) {
    const rows = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.filter(item => item.language === language)
    assert.equal(rows.length, 5, language)
    assert.deepEqual([...new Set(rows.map(item => item.category))].sort(), expected, language)
    assert.equal(rows.filter(item => item.mode === 'deterministic_fallback').length, 1, language)
    assert.equal(rows.filter(item => item.mode === 'cos').length, 4, language)
  }
})

test('COS acceptance prompts carry a stable factual token and transformations carry the URL token', () => {
  const cosCases = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.filter(item => item.mode === 'cos')
  assert.ok(cosCases.length > 0)
  assert.ok(cosCases.every(item => item.prompt.includes('ALPHA-42')))
  for (const language of ACCEPTANCE_LANGUAGES) {
    const transform = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.find(item => item.language === language && item.category === 'transformation')
    assert.ok(transform)
    assert.match(transform.prompt, /https:\/\/example\.com\/plan/)
  }
})

test('language signal recognizes representative native-language prose for all five locales', () => {
  assert.equal(selectedLanguageSignal('The team can use the short pilot to learn and reduce risk for the next release.', 'en'), true)
  assert.equal(selectedLanguageSignal('El equipo puede usar el piloto para reducir el riesgo y aprender antes de la implantación.', 'es'), true)
  assert.equal(selectedLanguageSignal('A equipe pode usar o piloto para reduzir o risco e aprender antes da implementação.', 'pt'), true)
  assert.equal(selectedLanguageSignal('Zespół może użyć pilotażu, aby ograniczyć ryzyko i sprawdzić rozwiązanie przed wdrożeniem.', 'pl'), true)
  assert.equal(selectedLanguageSignal('Команда может использовать пилот, чтобы снизить риск и проверить решение перед внедрением.', 'ru'), true)
})

test('obvious English support leakage is rejected in every non-English locale', () => {
  const leak = 'I can help. To get started, tell me your goal and then choose the next step.'
  for (const language of ['es','pt','pl','ru'] as const) assert.equal(hasEnglishLeakage(leak, language), true, language)
  assert.equal(hasEnglishLeakage(leak, 'en'), false)
})

test('critical token preservation is part of the automated acceptance verdict', () => {
  const testCase = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.find(item => item.language === 'pl' && item.category === 'transformation')!
  const base = {
    test:testCase,
    handled:true,
    responseSource:'local_cos_reasoning',
    localModelInvoked:true,
    externalAiInvoked:false,
    latencyMs:100,
  }
  const preserved = evaluateLanguageAcceptanceText({ ...base, reply:'Proszę sprawdzić ALPHA-42 na https://example.com/plan i przekazać uwagi, aby zespół mógł zakończyć przegląd.' })
  assert.equal(preserved.criticalTokensPreserved, true)
  const lost = evaluateLanguageAcceptanceText({ ...base, reply:'Proszę sprawdzić projekt i przekazać uwagi, aby zespół mógł zakończyć przegląd.' })
  assert.equal(lost.criticalTokensPreserved, false)
})

test('deterministic Concierge fallback stays in the selected language across all five locales', () => {
  for (const language of ACCEPTANCE_LANGUAGES) {
    const caseItem = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.find(item => item.language === language && item.mode === 'deterministic_fallback')!
    const result = getConciergeAnswer(caseItem.prompt, language)
    assert.ok(result.reply.trim(), language)
    assert.equal(result.language, language)
    assert.equal(selectedLanguageSignal(result.reply, language), true, `${language}: selected language`)
    assert.equal(hasEnglishLeakage(result.reply, language), false, `${language}: leakage`)
  }
})

test('route is owner-only, executes public scope with cache disabled, and keeps human native review separate', () => {
  const route = read('../app/api/admin/concierge-language-acceptance/route.ts')
  const runner = read('../lib/ai/cos/conciergeLanguageAcceptance.ts')
  const migration = read('../supabase/migrations/20260907015500_concierge_language_acceptance.sql')
  assert.match(route, /requireOwner\(\)/)
  assert.match(runner, /withPublicDeliveryScope/)
  assert.match(runner, /disableCache:\s*true/)
  assert.match(route, /method|PATCH|native_reviews/i)
  assert.match(route, /allNativeReviewsPass/)
  assert.match(migration, /"en":"pending","es":"pending","pt":"pending","pl":"pending","ru":"pending"/)
  assert.match(migration, /revoke all .* anon, authenticated/i)
  assert.match(migration, /enable row level security/i)
})

test('dashboard separates automated evidence from fluent-human native review', () => {
  const page = read('../app/dashboard/concierge-language-acceptance/page.tsx')
  assert.match(page, /runMatrix/)
  assert.match(page, /caseKeys/)
  assert.match(page, /reviewLanguage/)
  assert.match(page, /automated_gate_passed/)
  assert.match(page, /full_gate_passed/)
  assert.match(page, /native_reviews/)
  assert.doesNotMatch(page, /automated_gate_passed\s*\?\s*.*full_gate_passed/s)
})
