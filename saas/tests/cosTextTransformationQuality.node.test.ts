import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectDirectTextTransformation } from '../lib/ai/cos/textTransformationInput.ts'
import {
  normalizeTextTransformationPresentation,
  textTransformationMode,
  textTransformationStyleBlock,
} from '../lib/ai/cos/textTransformationQuality.ts'
import {
  formatNeuralCommunicationResult,
  isNeuralCommunicationTransformation,
} from '../lib/ai/cos/communicationNeuralReasoning.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const JC_DRAFT = `Hi JC,

It was nice to talk to you after all these years. I am really sorry you have to leave the job you love. Make sure to register/assign for the REA job. Per our conversation I am working on this platform and if you can provide a feed back I really appreciate. www\\.saas.signalboostapp.com

Thank you`

test('transformation depth distinguishes proofreading from real editing and rewriting', () => {
  assert.equal(textTransformationMode('proofread this email'), 'proofread')
  assert.equal(textTransformationMode('edit this email'), 'edit')
  assert.equal(textTransformationMode('polish this message'), 'polish')
  assert.equal(textTransformationMode('rewrite this note'), 'rewrite')
  assert.equal(textTransformationMode('shorten this paragraph'), 'shorten')
  assert.equal(textTransformationMode('summarize this report'), 'summarize')
  assert.equal(textTransformationMode('translate this to Polish'), 'translate')
})

test('edit mode explicitly requires material improvement rather than grammar-only mirroring', () => {
  const block = textTransformationStyleBlock('edit this email')
  assert.match(block, /EDITING is more than proofreading/i)
  assert.match(block, /rewrite awkward, literal, fragmented, repetitive, or non-native wording/i)
  assert.match(block, /mirrors the source sentence-by-sentence with corrected grammar is insufficient/i)
  assert.match(block, /reorganize sentences and paragraphs/i)
})

test('proofread mode remains conservative so factual-fidelity protection is not lost', () => {
  const block = textTransformationStyleBlock('proofread this email')
  assert.match(block, /PROOFREADING is conservative/i)
  assert.match(block, /minimal rewriting/i)
  assert.doesNotMatch(block, /mirrors the source sentence-by-sentence with corrected grammar is insufficient/i)
})

test('rough JC email is recognized as an edit objective and a neural communication task', () => {
  const request = detectDirectTextTransformation(`edit - ${JC_DRAFT}`)
  assert.ok(request)
  assert.equal(textTransformationMode(request!.instruction), 'edit')
  assert.equal(isNeuralCommunicationTransformation(request!.instruction, request!.sourceText), true)
  assert.match(request!.sourceText, /\bJC\b/)
  assert.match(request!.sourceText, /\bREA\b/)
  assert.match(request!.sourceText, /signalboostapp\.com/)
})

test('proofreading does not invoke strategic neural correspondence rewriting', () => {
  assert.equal(isNeuralCommunicationTransformation('proofread this email', JC_DRAFT), false)
})

test('presentation cleanup removes Markdown URL escaping without changing the destination', () => {
  assert.equal(
    normalizeTextTransformationPresentation('Please review www\\.saas.signalboostapp.com when you have time.'),
    'Please review www.saas.signalboostapp.com when you have time.',
  )
  assert.equal(
    normalizeTextTransformationPresentation('See https://saas\\.signalboostapp\\.com/pricing.'),
    'See https://saas.signalboostapp.com/pricing.',
  )
})

test('neural communication result can offer a recommended reply plus distinct alternatives', () => {
  const rendered = formatNeuralCommunicationResult({
    recommended: 'Recommended draft',
    alternativesUseful: true,
    alternatives: [
      { label: 'Warmer', text: 'Warmer draft' },
      { label: 'More concise', text: 'Concise draft' },
    ],
  })
  assert.match(rendered, /^Recommended reply/m)
  assert.match(rendered, /Alternative — Warmer/)
  assert.match(rendered, /Alternative — More concise/)
})

test('correspondence route uses deep-neural communication judgment and validated cognitive skills', () => {
  const direct = read('../lib/ai/cos/directTextTransformation.ts')
  const neural = read('../lib/ai/cos/communicationNeuralReasoning.ts')

  assert.match(direct, /tryNeuralCommunicationTransformation/)
  assert.match(direct, /Neural Communication Advisor/)
  assert.match(direct, /Validated Cognitive Skills/)
  assert.match(neural, /retrieveValidatedCognitiveSkills/)
  assert.match(neural, /Generate at least THREE genuinely different candidate approaches internally/i)
  assert.match(neural, /Neural Communication Quality Board/)
  assert.match(neural, /releaseScore < 0\.82/)
  assert.match(neural, /recordCitedCognitiveSkillReuse/)
  assert.doesNotMatch(neural, /canned reply|fixed email template/i)
})

test('direct editor keeps deterministic code as a fidelity guard rather than the writer', () => {
  const source = read('../lib/ai/cos/directTextTransformation.ts')
  assert.match(source, /Deterministic code below only protects facts\/intent/i)
  assert.match(source, /normalizeTextTransformationPresentation/)
  assert.match(source, /contextualEditIntentViolation/)
  assert.doesNotMatch(source, /The permitted scope of correction is grammar, spelling, agreement, articles, hyphenation, punctuation, word order, and sentence structure\. Nothing wider\./)
})
