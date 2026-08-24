import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectDirectTextTransformation,
  stripQuotedEmailThread,
  transformationLanguageInstruction,
} from '../lib/ai/cos/textTransformationInput.ts'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('editing, summarizing and translation are recognized across all five SignalBoost locales', () => {
  const prompts = [
    'edit: Hi Dwight, thank you for letting me know. Please make this message more professional.',
    'edite: Olá Dwight, obrigado por me avisar. Por favor melhore esta mensagem profissionalmente.',
    'edita: Hola Dwight, gracias por avisarme. Por favor mejora este mensaje profesionalmente.',
    'popraw: Cześć Dwight, dziękuję za wiadomość. Proszę popraw ten tekst profesjonalnie.',
    'отредактируй: Привет, Дуайт. Спасибо за сообщение. Пожалуйста, сделай текст профессиональным.',
    'translate into Polish: Thank you for your message. I will support the mission as required.',
    'traduza para inglês: Obrigado pela sua mensagem. Vou apoiar a missão conforme necessário.',
    'traduce al inglés: Gracias por tu mensaje. Apoyaré la misión según sea necesario.',
    'przetłumacz na angielski: Dziękuję za wiadomość. W razie potrzeby wesprę misję.',
    'переведи на английский: Спасибо за сообщение. Я поддержу миссию по мере необходимости.',
  ]

  for (const prompt of prompts) {
    assert.ok(detectDirectTextTransformation(prompt), prompt)
    assert.equal(isContentGenerationRequest(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('quoted email history is removed in English Portuguese Spanish Polish and Russian', () => {
  const cases = [
    ['From: Dwight <dwight@example.com>', 'Sent: Monday', 'To: Luis <luis@example.com>', 'Subject: Mission'],
    ['De: Dwight <dwight@example.com>', 'Enviado: segunda-feira', 'Para: Luis <luis@example.com>', 'Assunto: Missão'],
    ['De: Dwight <dwight@example.com>', 'Enviado: lunes', 'Para: Luis <luis@example.com>', 'Asunto: Misión'],
    ['Od: Dwight <dwight@example.com>', 'Wysłano: poniedziałek', 'Do: Luis <luis@example.com>', 'Temat: Misja'],
    ['От: Dwight <dwight@example.com>', 'Отправлено: понедельник', 'Кому: Luis <luis@example.com>', 'Тема: Миссия'],
  ]

  for (const headers of cases) {
    const source = ['Hi Dwight,', '', 'Thank you for your message. I will support the mission.', '', 'Regards,', 'Luis', '', ...headers, '', 'Older quoted message'].join('\n')
    assert.equal(stripQuotedEmailThread(source), 'Hi Dwight,\n\nThank you for your message. I will support the mission.\n\nRegards,\nLuis')
  }
})

test('five locale codes produce explicit full language instructions', () => {
  const expected = { en: 'English', pt: 'Portuguese', es: 'Spanish', pl: 'Polish', ru: 'Russian' }
  for (const [code, language] of Object.entries(expected)) {
    const instruction = transformationLanguageInstruction(code)
    assert.match(instruction, new RegExp(language))
    assert.match(instruction, /keep the source language/i)
    assert.match(instruction, /translation/i)
  }
})

test('direct editor contract requires polished business correspondence and forbids quoted-thread echo', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /polished, concise, businesslike tone/i)
  assert.match(source, /rough, fragmented, misspelled, or non-native wording/i)
  assert.match(source, /Never reproduce, rewrite, summarize, or append a prior message thread/i)
  assert.match(source, /stripQuotedEmailThread\(request\.sourceText\)/)
})
