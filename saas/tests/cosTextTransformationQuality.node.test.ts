import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectDirectTextTransformation } from '../lib/ai/cos/textTransformationInput.ts'
import {
  normalizeTextTransformationPresentation,
  textTransformationMode,
  textTransformationStyleBlock,
} from '../lib/ai/cos/textTransformationQuality.ts'

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

test('rough JC email is recognized as an edit objective and keeps protected domain terms', () => {
  const request = detectDirectTextTransformation(`edit - ${JC_DRAFT}`)
  assert.ok(request)
  assert.equal(textTransformationMode(request!.instruction), 'edit')
  assert.match(request!.sourceText, /\bJC\b/)
  assert.match(request!.sourceText, /\bREA\b/)
  assert.match(request!.sourceText, /signalboostapp\.com/)
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

test('direct editor no longer treats all edits as bounded grammar-only correction', () => {
  const source = read('../lib/ai/cos/directTextTransformation.ts')
  assert.match(source, /textTransformationStyleBlock/)
  assert.match(source, /materially improve rough wording/i)
  assert.match(source, /ordinary wording is editable/i)
  assert.doesNotMatch(source, /The permitted scope of correction is grammar, spelling, agreement, articles, hyphenation, punctuation, word order, and sentence structure\. Nothing wider\./)
  assert.match(source, /normalizeTextTransformationPresentation\(finalAnswer\)/)
})
