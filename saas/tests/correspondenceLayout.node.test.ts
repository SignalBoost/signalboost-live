// saas/tests/correspondenceLayout.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CORRESPONDENCE_LAYOUT_RULES,
  looksLikeCorrespondence,
  restoreCorrespondenceLayout,
} from '../lib/ai/cos/correspondenceLayout.ts'

// The exact production failure: a wording-correct edit returned as one run-on block.
const PRODUCTION_SOURCE = `Hi JC,
It was nice to talk to you after all these years. I am really sorry you have to leave the job you love.  Make sure to register/assign for the REA job.  Per our conversation I am working on this platform and if you can provide a feed back I really appreciate.  [www.saas.signalboostapp.com](http://www.saas.signalboostapp.com)

Thank you`

const PRODUCTION_ANSWER = 'Hi JC, It was great to catch up with you after all these years. I\u2019m sorry to hear that you\u2019re leaving a role you love. Please make sure to register or assign yourself for the REA job. As we discussed, I am currently working on this platform, and I would really appreciate your feedback: [www.saas.signalboostapp.com](https://www.saas.signalboostapp.com). Thank you'

test('the production run-on reply is restored to email shape', () => {
  const out = restoreCorrespondenceLayout(PRODUCTION_ANSWER, PRODUCTION_SOURCE)
  const lines = out.split('\n')
  assert.equal(lines[0], 'Hi JC,')
  assert.equal(lines[1], '')
  assert.ok(lines[2].startsWith('It was great to catch up'))
  assert.equal(lines[lines.length - 1], 'Thank you')
  assert.equal(lines[lines.length - 2], '')
})

test('restoration is whitespace-only — no character is added, removed or reordered', () => {
  const out = restoreCorrespondenceLayout(PRODUCTION_ANSWER, PRODUCTION_SOURCE)
  assert.equal(out.replace(/\s+/g, ' ').trim(), PRODUCTION_ANSWER.replace(/\s+/g, ' ').trim())
})

test('an answer that already has blank lines is returned untouched', () => {
  const already = 'Hi JC,\n\nGood to speak with you.\n\nThank you'
  assert.equal(restoreCorrespondenceLayout(already, PRODUCTION_SOURCE), already)
})

test('non-correspondence prose is never restructured', () => {
  const prose = 'The migration breaks even after 2.2 hours of sustained transfer. Thank you'
  assert.equal(restoreCorrespondenceLayout(prose, 'Explain the migration break-even.'), prose)
})

test('salutations and closings are recognised in all five supported languages', () => {
  const cases: Array<[string, string, string]> = [
    ['Hola JC, gracias por tu tiempo. Saludos', 'Hola JC,', 'Saludos'],
    ['Ol\u00e1 JC, obrigado pelo seu tempo. Atenciosamente', 'Ol\u00e1 JC,', 'Atenciosamente'],
    ['Cze\u015b\u0107 JC, dzi\u0119kuj\u0119 za rozmow\u0119. Pozdrawiam', 'Cze\u015b\u0107 JC,', 'Pozdrawiam'],
    ['\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 JC, \u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u044e \u0437\u0430 \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440. \u0421 \u0443\u0432\u0430\u0436\u0435\u043d\u0438\u0435\u043c', '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 JC,', '\u0421 \u0443\u0432\u0430\u0436\u0435\u043d\u0438\u0435\u043c'],
    ['Dear JC, thank you for the update. Best regards', 'Dear JC,', 'Best regards'],
  ]
  for (const [answer, firstLine, lastLine] of cases) {
    const lines = restoreCorrespondenceLayout(answer, answer).split('\n')
    assert.equal(lines[0], firstLine, answer)
    assert.equal(lines[lines.length - 1], lastLine, answer)
    assert.equal(lines[1], '', answer)
  }
})

test('a closing word inside the body is not moved — only a trailing one is', () => {
  const answer = 'Hi JC, I said thank you at the time and I meant it.'
  const lines = restoreCorrespondenceLayout(answer, answer).split('\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[2], 'I said thank you at the time and I meant it.')
})

test('empty and whitespace answers are passed through', () => {
  assert.equal(restoreCorrespondenceLayout('', PRODUCTION_SOURCE), '')
  assert.equal(restoreCorrespondenceLayout('   ', PRODUCTION_SOURCE), '   ')
})

test('looksLikeCorrespondence separates letters from prose', () => {
  assert.equal(looksLikeCorrespondence('Hi JC, hope you are well'), true)
  assert.equal(looksLikeCorrespondence('Highly available clusters need quorum'), false)
})

test('the layout rules instruct real line breaks inside the JSON envelope', () => {
  assert.match(CORRESPONDENCE_LAYOUT_RULES, /salutation on its own line/i)
  assert.match(CORRESPONDENCE_LAYOUT_RULES, /blank line/i)
  assert.match(CORRESPONDENCE_LAYOUT_RULES, /\\n inside the JSON/i)
})
