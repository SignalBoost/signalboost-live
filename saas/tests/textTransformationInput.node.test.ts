import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectDirectTextTransformation,
  splitQuotedEmailThread,
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

test('quoted email history is removed from output but retained as read-only reference context', () => {
  const cases = [
    ['From: Dwight <dwight@example.com>', 'Sent: Monday', 'To: Luis <luis@example.com>', 'Subject: Mission'],
    ['De: Dwight <dwight@example.com>', 'Enviado: segunda-feira', 'Para: Luis <luis@example.com>', 'Assunto: Missão'],
    ['De: Dwight <dwight@example.com>', 'Enviado: lunes', 'Para: Luis <luis@example.com>', 'Asunto: Misión'],
    ['Od: Dwight <dwight@example.com>', 'Wysłano: poniedziałek', 'Do: Luis <luis@example.com>', 'Temat: Misja'],
    ['От: Dwight <dwight@example.com>', 'Отправлено: понедельник', 'Кому: Luis <luis@example.com>', 'Тема: Миссия'],
  ]

  for (const headers of cases) {
    const source = ['Hi Dwight,', '', 'Thank you for your message. I will support the mission.', '', 'Regards,', 'Luis', '', ...headers, '', 'Older quoted message'].join('\n')
    const split = splitQuotedEmailThread(source)
    assert.equal(split.editableSource, 'Hi Dwight,\n\nThank you for your message. I will support the mission.\n\nRegards,\nLuis')
    assert.match(split.referenceContext || '', /Dwight/)
    assert.match(split.referenceContext || '', /Older quoted message/)
    assert.equal(stripQuotedEmailThread(source), split.editableSource)
  }
})

test('the Dwight-style reply keeps the question context available while isolating the draft', () => {
  const source = [
    'Hi Dwight, thank you for letting me know and for your concern. If you are thinking about cancelling it because of me, do not worry. At the end of the day, this is at the moment a person post, if I do not do it you will have to do it. We do what we have to do, and whatever is needed to support the mission.',
    '',
    'Regards,',
    'Luis',
    '',
    'From: Dwight <dwight@example.com>',
    'Sent: Monday',
    'To: Luis <luis@example.com>',
    'Subject: Courier mission',
    '',
    'Let me know if you want me to cancel the outbound shipment for this month.',
  ].join('\n')

  const split = splitQuotedEmailThread(source)
  assert.match(split.editableSource, /person post/)
  assert.doesNotMatch(split.editableSource, /cancel the outbound shipment for this month/)
  assert.match(split.referenceContext || '', /cancel the outbound shipment for this month/)
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

test('direct editor uses context plus a second professional editorial pass', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /capable human colleague/i)
  assert.match(source, /Resolve ambiguous references/i)
  assert.match(source, /direct question or requested decision/i)
  assert.match(source, /make the finished reply answer that question explicitly/i)
  assert.match(source, /REFERENCE CONTEXT — READ ONLY, DO NOT ECHO/)
  assert.match(source, /splitQuotedEmailThread\(request\.sourceText\)/)
  assert.match(source, /async function refineProfessionalDraft/)
  assert.match(source, /FINAL COS professional copy editor/)
  assert.match(source, /FIRST-PASS CANDIDATE/)
  assert.match(source, /'Editorial Quality Pass'/)
  assert.doesNotMatch(source, /const editableSource = stripQuotedEmailThread\(request\.sourceText\)/)
})
