import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  conciergeLanguageQualityInstruction,
  explicitlyPreservedCriticalTokens,
  NATIVE_LANGUAGE_ANSWER_POLICY,
  normalizeConciergeLanguage,
  preservesCriticalLanguageTokens,
  preservesExplicitlyRequestedCriticalTokens,
} from '../lib/ai/cos/conciergeLanguageQuality.ts'
import { classifyConciergeIntent, getConciergeAnswer } from '../lib/platform/unifiedPlatform.ts'

const read = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Concierge has a native-language quality contract for all five supported languages', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru'] as const) {
    const instruction = conciergeLanguageQualityInstruction(language)
    assert.match(instruction, /NATIVE-LANGUAGE QUALITY CONTRACT:/)
    assert.match(instruction, /direct|directamente|diretamente|bezpośrednio|сразу/i)
    assert.match(instruction, /MUST contain that exact literal/)
  }
  const spanish = conciergeLanguageQualityInstruction('es')
  assert.match(spanish, /concordancia de género y número/)
  assert.match(spanish, /determinantes, sustantivos y adjetivos/)
  const polish = conciergeLanguageQualityInstruction('pl')
  assert.match(polish, /przypadków/)
  assert.match(polish, /aspektu/)
  assert.match(polish, /Pan\/Pani/)
  assert.match(polish, /kalek/)
  assert.match(polish, /kontrolę odmiany/)
  assert.equal(normalizeConciergeLanguage('pl-PL'), 'pl')
  assert.equal(normalizeConciergeLanguage('xx'), 'en')
})

test('first-pass shared answer policy carries native rules for every supported language', () => {
  const policy = NATIVE_LANGUAGE_ANSWER_POLICY.join('\n')
  assert.match(policy, /English:/)
  assert.match(policy, /Spanish:/)
  assert.match(policy, /Brazilian Portuguese:/)
  assert.match(policy, /Polish:/)
  assert.match(policy, /Russian:/)
  assert.match(policy, /przypadków/)
  assert.match(policy, /rodzaju/)
  assert.match(policy, /rekcji/)
  assert.match(policy, /zgodności gramatycznej/)
  assert.match(policy, /morphology, agreement/)
  assert.match(policy, /failed answer/)

  const answerPolicy = read('../lib/ai/cos/cosAnswerPolicyCore.ts')
  const enterprise = read('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  const core = read('../lib/ai/cos/cosFirstAnswerCore.ts')
  assert.match(answerPolicy, /import \{ NATIVE_LANGUAGE_ANSWER_POLICY \} from '\.\/conciergeLanguageQuality\.ts'/)
  assert.match(answerPolicy, /\.\.\.NATIVE_LANGUAGE_ANSWER_POLICY/)
  assert.match(enterprise, /\.\.\.QUANTITATIVE_ANSWER_POLICY/)
  assert.match(enterprise, /`Reply in \$\{language\}\.\`/)
  assert.match(core, /\.\.\.QUANTITATIVE_ANSWER_POLICY/)
  assert.match(core, /input\.language \? `Reply in \$\{input\.language\}\.\` : 'Reply in the language of the user\.'/)
})

test('explicit preservation directives identify only literals the user required unchanged', () => {
  const spanish = 'Mantén ALPHA-42 sin cambios y explica el piloto en lenguaje natural.'
  assert.deepEqual(explicitlyPreservedCriticalTokens(spanish), ['ALPHA-42'])
  assert.equal(preservesExplicitlyRequestedCriticalTokens(spanish, 'ALPHA-42 sigue siendo el identificador del proyecto.'), true)
  assert.equal(preservesExplicitlyRequestedCriticalTokens(spanish, 'El proyecto sigue siendo el mismo.'), false)

  const transformed = 'Preserve ALPHA-42 and https://example.com/Plan exactly while rewriting the message.'
  assert.deepEqual(explicitlyPreservedCriticalTokens(transformed), ['https://example.com/Plan', 'ALPHA-42'])
  assert.equal(preservesExplicitlyRequestedCriticalTokens(transformed, 'ALPHA-42 — https://example.com/Plan'), true)
  assert.equal(preservesExplicitlyRequestedCriticalTokens(transformed, 'ALPHA-42 — https://example.com/plan'), false)
})

test('native-language review cannot drop critical facts and identifiers', () => {
  const original = 'Sprawdź https://saas.signalboostapp.com i zachowaj [KG12], FFmpeg oraz MP4.'
  assert.equal(
    preservesCriticalLanguageTokens(original, 'Sprawdź https://saas.signalboostapp.com; zachowaj [KG12], FFmpeg oraz MP4.'),
    true,
  )
  assert.equal(
    preservesCriticalLanguageTokens(original, 'Sprawdź panel i zachowaj MP4.'),
    false,
  )
})

test('deterministic Concierge recognizes intent in supported non-English languages', () => {
  assert.equal(classifyConciergeIntent('Wyeksportuj ten film do MP4'), 'video_export')
  assert.equal(classifyConciergeIntent('Quiero editar este vídeo'), 'video_edit')
  assert.equal(classifyConciergeIntent('Quero adicionar legendas SRT'), 'caption_overlay')
  assert.equal(classifyConciergeIntent('Покажи категории Marketplace'), 'marketplace')
})

test('Polish deterministic fallback is native Polish instead of English boilerplate', () => {
  const answer = getConciergeAnswer('Wyeksportuj ten film do MP4', 'pl')
  assert.equal(answer.language, 'pl')
  assert.equal(answer.intent, 'video_export')
  assert.match(answer.reply, /Otwórz Video Studio/)
  assert.match(answer.reply, /sprawdź stan subskrypcji/)
  assert.doesNotMatch(answer.reply, /Open Video Studio|confirm your subscription|queue the caption/i)
})

test('all five deterministic fallbacks stay in the selected language', () => {
  const cases = [
    ['en', 'Help me', /I can guide you/],
    ['es', 'Ayúdame', /Puedo orientarte/],
    ['pt', 'Ajude-me', /Posso orientar você/],
    ['pl', 'Pomóż mi', /Mogę pomóc/],
    ['ru', 'Помоги мне', /Я могу помочь/],
  ] as const
  for (const [language, prompt, expected] of cases) {
    const answer = getConciergeAnswer(prompt, language)
    assert.equal(answer.language, language)
    assert.match(answer.reply, expected)
  }
})

test('production Concierge propagates UI language and keeps review as a secondary guard', () => {
  const uiSource = read('../components/Concierge.tsx')
  const cosSource = read('../lib/ai/cos/cosFirstAnswer.ts')
  assert.match(uiSource, /language:\s*activeLang/)
  assert.match(cosSource, /reviewNativeLanguageQuality/)
  assert.match(cosSource, /preservesCriticalLanguageTokens/)
  assert.match(cosSource, /nativeLanguageQuality/)
})
