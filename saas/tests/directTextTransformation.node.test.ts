import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectDirectTextTransformation } from '../lib/ai/cos/textTransformationInput.ts'
import {
  contextualEditAnchorBlock,
  contextualEditIntentViolation,
  prepareContextualEdit,
  repairContextualEditDrift,
} from '../lib/ai/cos/contextualEditQuality.ts'

test('detects direct English text editing with hyphen-delimited source', () => {
  const detected = detectDirectTextTransformation('edit - Hi Dwight, thank you for let me know and for your concern.')
  assert.ok(detected)
  assert.equal(detected.instruction.toLowerCase(), 'edit')
  assert.match(detected.sourceText, /^Hi Dwight/)
})

test('detects natural inline edit shorthand without a delimiter', () => {
  const detected = detectDirectTextTransformation('edit Hi Dwight, thank you for letting me know. If you are thinking about cancelling because of me, please do not worry. We will do whatever is needed to support the mission.')
  assert.ok(detected)
  assert.equal(detected.instruction.toLowerCase(), 'edit')
  assert.match(detected.sourceText, /^Hi Dwight/)
})

test('detects supported multilingual rewrite requests', () => {
  assert.ok(detectDirectTextTransformation('Por favor, reescreva:\nOlá, preciso melhorar esta mensagem para meu gerente.'))
  assert.ok(detectDirectTextTransformation('Proszę popraw:\nDzień dobry, chcę poprawić tę wiadomość do mojego kierownika.'))
  assert.ok(detectDirectTextTransformation('Пожалуйста отредактируй:\nЗдравствуйте, пожалуйста улучшите это сообщение для моего руководителя.'))
})

test('does not hijack generic questions that merely mention editing', () => {
  assert.equal(detectDirectTextTransformation('What editing features does SignalBoost support?'), null)
  assert.equal(detectDirectTextTransformation('How should I edit a website for better conversions?'), null)
})

test('referral-only edits preserve who is responsible for the underlying action', () => {
  const source = 'Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still waiting for it to be activated, how or who could give us info about the status of the activation. We appreciate any info you may have on this. Thank you.'
  const prepared = prepareContextualEdit(source, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)

  assert.match(anchors, /ROUTING\/REFERRAL only/i)
  assert.match(anchors, /Do NOT broaden this into a request for this recipient to provide/i)

  const drifted = 'Dear AskISSO,\n\nWe had Enterprise Wi-Fi installed in Paramaribo a few months ago, but it has not yet been activated. Could you please provide an update on the status of the activation or let us know who we should contact for more information?\n\nThank you.'
  assert.equal(
    contextualEditIntentViolation({ originalSource: source, answer: drifted }),
    'recipient_role_expansion',
  )

  const repaired = repairContextualEditDrift({
    originalSource: source,
    referenceContext: null,
    answer: drifted,
    language: 'en',
  })
  assert.equal(contextualEditIntentViolation({ originalSource: source, answer: repaired }), null)
  assert.doesNotMatch(repaired, /provide an update on the status/i)
  assert.match(repaired, /who or which office we should contact/i)
})

test('an explicit direct status request is not incorrectly reduced to referral-only', () => {
  const source = 'Could you please provide an update on the activation status or let us know who we should contact for more information?'
  const prepared = prepareContextualEdit(source, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)
  assert.doesNotMatch(anchors, /ROUTING\/REFERRAL only/i)
})

test('direct text transformation runs before freshness and ordinary retrieval', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFirstAnswer.ts'), 'utf8')
  const direct = source.indexOf('tryDirectTextTransformation(input)')
  const fresh = source.indexOf('requiresFreshExternalEvidence(input.prompt)')
  assert.ok(direct >= 0)
  assert.ok(fresh >= 0)
  assert.ok(direct < fresh)
})

test('recognized edit intent cannot fall through to freshness when the direct reasoner is unavailable', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /if \(!resolved\.config\) \{[\s\S]*handled: false[\s\S]*direct text-transformation request/)
  assert.doesNotMatch(source, /if \(!resolved\.config\) return null/)
})

test('direct editor prompt explicitly preserves communicative intent and request scope', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /Preserve the COMMUNICATIVE INTENT/)
  assert.match(source, /Never broaden the requested action/)
  assert.match(source, /routing\/referral request/)
  assert.match(source, /contextualEditIntentViolation/)
})

test('homepage keeps a permanent rich COS response card', () => {
  const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  assert.match(source, /import AssistantMessage from '@\/components\/AssistantMessage'/)
  assert.match(source, /<article className=\{'answer'/)
  assert.match(source, /<AssistantMessage content=\{answer\} \/>/)
  assert.match(source, /answer-placeholder/)
  assert.doesNotMatch(source, /\{answer \? <article/)
  assert.doesNotMatch(source, /<p>\{answer\}<\/p>/)
})

test('homepage renders a server reply even when the HTTP status is non-2xx', () => {
  const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  assert.match(source, /if \(!reply\) throw new Error\('concierge_unavailable'\)/)
  assert.doesNotMatch(source, /if \(!response\.ok \|\| !reply\)/)
})
