import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  conciergeLanguageQualityInstruction,
  normalizeConciergeLanguage,
  preservesCriticalLanguageTokens,
} from '../lib/ai/cos/conciergeLanguageQuality.ts'
import { classifyConciergeIntent, getConciergeAnswer } from '../lib/platform/unifiedPlatform.ts'

test('Concierge has a native-language quality contract for all five supported languages', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru'] as const) {
    const instruction = conciergeLanguageQualityInstruction(language)
    assert.match(instruction, /NATIVE-LANGUAGE QUALITY CONTRACT:/)
    assert.match(instruction, /direct|directamente|diretamente|bezpośrednio|сразу/i)
  }
  const polish = conciergeLanguageQualityInstruction('pl')
  assert.match(polish, /przypadków/)
  assert.match(polish, /aspektu/)
  assert.match(polish, /Pan\/Pani/)
  assert.match(polish, /kalek/)
  assert.equal(normalizeConciergeLanguage('pl-PL'), 'pl')
  assert.equal(normalizeConciergeLanguage('xx'), 'en')
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

test('production Concierge propagates UI language and COS applies native-language review', () => {
  const uiSource = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  const cosSource = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
  assert.match(uiSource, /language:\s*activeLang/)
  assert.match(cosSource, /reviewNativeLanguageQuality/)
  assert.match(cosSource, /preservesCriticalLanguageTokens/)
})
