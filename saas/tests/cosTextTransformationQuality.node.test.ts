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

const FOREIGN_SERVICE_DRAFT = `I struggle all night wether i should or not address this email chain again, but like one of our colleagues mentioned, if not for us, we should help others who can benefit. After 20+ years I am retiring next year, since I joined the foreign service I have been hearing from some of our coleagues that they do not want to get promoted, and some of these coleagues are the ones promoted over and over again. The department should place a box in the EER, something like "do you care about carrer mobiltiy" yes or no, and this box shold be mandatory to fill. The promotion board knowing who wants to be promoted or not will save time and other resources for the department. Give the chance for those who want carrer mobility and be part of the decision makers group, while let those who enjoy carrying pouches or crawling under desks fixing computers to do so. It makes little sense to promote people to a level that they do not want to be. I am not saying that everyone who wants to get promoted will be a good manager but at least that person is willing to try. The bottom line is, if you say you do not want to be promoted, say so officially.`

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

test('body-only Foreign Service correspondence is also sent to the deep-neural communication lane', () => {
  const request = detectDirectTextTransformation(`edit - ${FOREIGN_SERVICE_DRAFT}`)
  assert.ok(request)
  assert.equal(textTransformationMode(request!.instruction), 'edit')
  assert.equal(isNeuralCommunicationTransformation(request!.instruction, request!.sourceText), true)
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

test('correspondence route uses the real deep-neural communication advisor and quality board', () => {
  const direct = read('../lib/ai/cos/directTextTransformation.ts')
  const neural = read('../lib/ai/cos/communicationNeuralReasoning.ts')

  assert.match(direct, /tryStrategicNeuralCommunicationTransformation/)
  assert.match(direct, /PRIMARY CORRESPONDENCE WRITER — DEEP-NEURAL/i)
  assert.match(direct, /Neural Communication Advisor/)
  assert.match(direct, /Neural Communication Quality Board/)
  assert.match(neural, /retrieveValidatedCognitiveSkills/)
  assert.match(neural, /Generate at least THREE genuinely different candidate approaches internally/i)
  assert.match(neural, /Neural Communication Quality Board/)
  assert.match(neural, /releaseScore < 0\.82/)
  assert.match(neural, /evaluateDelicateCandidate/)
  assert.match(neural, /repairFromIndependentEvaluation/)
  assert.match(neural, /evaluationPasses/)
  assert.match(direct, /if \(!strategicNeural\?\.recommended\.trim\(\)\)/)
  assert.match(neural, /recordCitedCognitiveSkillReuse/)
  assert.doesNotMatch(neural, /canned reply|fixed email template/i)
})

test('independent delicate-writing gate targets the observed accusatory and generic failures', () => {
  const neural = read('../lib/ai/cos/communicationNeuralReasoning.ts')
  assert.match(neural, /changes "say\/express" into accusatory wording such as "claim"/i)
  assert.match(neural, /uses blunt conclusions such as "the bottom line is simple"/i)
  assert.match(neural, /invents organizational benefits, motives, conduct, acceptance of promotion, succession planning, or HR practices/i)
  assert.match(neural, /Score each dimension independently/i)
  assert.match(neural, /re-evaluation/i)
})

test('deep-neural communication guidance covers sensitive institutional and diplomatic writing', () => {
  const neural = read('../lib/ai/cos/communicationNeuralReasoning.ts')
  assert.match(neural, /INSTITUTIONAL \/ DIPLOMATIC CORRESPONDENCE/i)
  assert.match(neural, /Distinguish observation from inference/i)
  assert.match(neural, /Convert personal frustration into an institutional argument/i)
  assert.match(neural, /Diplomatic does not mean vague/i)
  assert.match(neural, /technical, operational, non-managerial, or hands-on work is lesser work/i)
  assert.match(neural, /five independent dimensions: meaning fidelity, diplomatic judgment, elegance\/naturalness, authentic voice, and absence of unsupported additions/i)
  assert.match(neural, /Reject generic memo structure, invented headings or numbered benefit lists/i)
  assert.match(neural, /Reject categorical claims about fairness, efficiency, resource savings, morale, or institutional outcomes/i)
})

test('final editor preserves authentic voice without copying risky rhetoric or inventing identity', () => {
  const direct = read('../lib/ai/cos/directTextTransformation.ts')
  assert.match(direct, /Preserve supported emotional meaning, lived experience, reflective authority, and recognizable voice/i)
  assert.match(direct, /Transform ridicule, contempt, or a risky metaphor into a dignified expression/i)
  assert.match(direct, /Never invent a salutation, sign-off, name, title, or bracketed signature placeholder/i)
  assert.match(direct, /sound like this writer at their best, not like an anonymous staff template/i)
})

test('direct editor keeps deterministic code as fidelity and release guards rather than the writer', () => {
  const source = read('../lib/ai/cos/directTextTransformation.ts')
  assert.match(source, /Deterministic code only protects meaning/i)
  assert.match(source, /normalizeTextTransformationPresentation/)
  assert.match(source, /contextualEditIntentViolation/)
  assert.match(source, /restoreCorrespondenceLayout/)
  assert.match(source, /stripInventedCorrespondenceFraming/)
  assert.doesNotMatch(source, /canned reply|fixed email template/i)
  assert.doesNotMatch(source, /The permitted scope of correction is grammar, spelling, agreement, articles, hyphenation, punctuation, word order, and sentence structure\. Nothing wider\./)
})
