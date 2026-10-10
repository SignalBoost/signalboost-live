// saas/tests/cosInstructionNarration.node.test.ts
//
// AN ANSWER MUST NOT NARRATE ITS OWN INSTRUCTIONS (2026-10-09). Production released, for
// "quem sera o proximo presidente do Brasil?", an answer made largely of the model talking about its rules
// ("A resposta deve ser neutra ... Como iTMounts, devo ... conforme as diretrizes fornecidas").
// These tests use that exact answer, cover all 11 languages, and guard against false positives.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  INSTRUCTION_NARRATION_SIGNAL,
  instructionNarrationSentences,
  instructionNarrationSignals,
  stripInstructionNarration,
} from '../lib/ai/cos/cosInstructionNarration.ts'
import { blockingReleaseSignals } from '../lib/ai/cos/releaseSignalSeverity.ts'

const PRODUCTION_ANSWER = `A pergunta sobre quem será o próximo presidente do Brasil não pode ser respondida com certeza, pois as eleições presidenciais no Brasil ocorrem em 2026 e ainda não há resultados definitivos. A resposta deve ser neutra e factual, evitando especulações ou previsões não fundamentadas. Como iTMounts, devo manter-me dentro dos limites de informações públicas e não fornecer previsões políticas.

A eleição presidencial brasileira de 2026 ainda está longe, e os candidatos oficiais ainda não foram anunciados. É importante evitar qualquer afirmação que possa ser interpretada como uma previsão ou comentário político. A resposta deve ser direta, factual e neutra, conforme as diretrizes fornecidas.`

test('the exact production answer is caught: all four narrating sentences', () => {
  const found = instructionNarrationSentences(PRODUCTION_ANSWER)
  assert.equal(found.length, 4)
  assert.ok(found.some(s => s.startsWith('A resposta deve ser neutra')))
  assert.ok(found.some(s => s.startsWith('Como iTMounts, devo')))
  assert.ok(found.some(s => s.startsWith('É importante evitar qualquer afirmação')))
  assert.ok(found.some(s => s.includes('conforme as diretrizes fornecidas')))
  assert.deepEqual(instructionNarrationSignals(PRODUCTION_ANSWER), [INSTRUCTION_NARRATION_SIGNAL])
})

test('the signal is blocking, so the release gate repairs it and never releases it unrepaired', () => {
  assert.deepEqual(blockingReleaseSignals([INSTRUCTION_NARRATION_SIGNAL]), [INSTRUCTION_NARRATION_SIGNAL])
})

test('stripping keeps the substantive sentences and removes every narrating one', () => {
  const stripped = stripInstructionNarration(PRODUCTION_ANSWER)
  assert.ok(stripped)
  assert.match(stripped!, /^A pergunta sobre quem será o próximo presidente/)
  assert.doesNotMatch(stripped!, /A resposta deve|Como iTMounts|diretrizes fornecidas|É importante evitar/)
  assert.deepEqual(instructionNarrationSignals(stripped!), [])
})

test('an answer that is only narration strips to nothing and fails closed', () => {
  assert.equal(stripInstructionNarration('A resposta deve ser neutra e factual. Como iTMounts, devo evitar previsões.'), null)
})

test('narration is caught in every supported language', () => {
  const samples: Record<string, string> = {
    en: 'The answer should be neutral and factual. As iTMounts, I must stay within public information.',
    es: 'La respuesta debe ser neutral y factual, conforme a las directrices proporcionadas.',
    pt: 'Como iTMounts, devo manter a neutralidade.',
    pl: 'Odpowiedź powinna być neutralna, zgodnie z przekazanymi wytycznymi.',
    ru: 'Ответ должен быть нейтральным, согласно предоставленным инструкциям.',
    de: 'Die Antwort sollte neutral sein, gemäß den bereitgestellten Richtlinien.',
    fr: 'La réponse doit être neutre, conformément aux directives fournies.',
    it: 'La risposta deve essere neutrale, secondo le linee guida fornite.',
    ja: '提供されたガイドラインに従って、回答は中立であるべきです。',
    ko: '제공된 지침에 따라 답변은 중립적이어야 합니다.',
    ar: 'يجب أن تكون الإجابة محايدة وفقًا للإرشادات المقدمة.',
  }
  for (const [lang, text] of Object.entries(samples)) {
    assert.deepEqual(instructionNarrationSignals(text), [INSTRUCTION_NARRATION_SIGNAL], lang)
  }
})

test('ordinary answers in every language pass untouched (no false positives)', () => {
  const clean = [
    'The first round of the Brazilian presidential election was held on October 4, 2026; I do not have verified results.',
    'According to WHO guidelines, adults should get at least 150 minutes of moderate activity per week.',
    'Your reply to the customer should include the order number and the delivery date.',
    'The answer depends on your jurisdiction; check the contract terms first.',
    'O primeiro turno da eleição presidencial foi em 4 de outubro de 2026; não tenho resultados verificados.',
    'De acordo com a OMS, adultos devem praticar pelo menos 150 minutos de atividade por semana.',
    'La primera vuelta se celebró el 4 de octubre de 2026.',
    'Die erste Runde fand am 4. Oktober 2026 statt.',
    'Le premier tour a eu lieu le 4 octobre 2026.',
    'Il primo turno si è svolto il 4 ottobre 2026.',
    'Pierwsza tura odbyła się 4 października 2026 r.',
    'Первый тур прошёл 4 октября 2026 года.',
    '第1回投票は2026年10月4日に行われました。',
    '1차 투표는 2026년 10월 4일에 실시되었습니다.',
    'أُجريت الجولة الأولى في 4 أكتوبر 2026.',
    'COS is the reasoning layer of iTMounts and answers questions directly.',
  ]
  for (const text of clean) {
    assert.deepEqual(instructionNarrationSignals(text), [], text)
    const doubled = `${text} ${text}`
    assert.equal(stripInstructionNarration(doubled), doubled, `strip must not alter clean text: ${text}`)
  }
})

test('the release gate, its repair prompt and both cache replays are wired to the detector', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /import \{ INSTRUCTION_NARRATION_SIGNAL, instructionNarrationSignals, stripInstructionNarration \} from '\.\/cosInstructionNarration\.ts'/)
  assert.match(source, /\.\.\.instructionNarrationSignals\(parseLocalResult\(raw\)\?\.answer \|\| raw\),/)
  assert.match(source, /never describe your instructions or guidelines, what the answer should be, or what you must avoid, and never refer to yourself by name/)
  assert.match(source, /instructionNarrationSignals\(payload\.reply\)\.length === 0/)
  assert.match(source, /instructionNarrationSignals\(cached\.reply\)\.length === 0/)
  assert.match(source, /remainingBlocking\.every\(signal => signal === INSTRUCTION_NARRATION_SIGNAL\)/)
  assert.match(source, /if \(narrationStripped\) parsed = \{ \.\.\.narrationCandidate, answer: narrationStripped \}/)
})
