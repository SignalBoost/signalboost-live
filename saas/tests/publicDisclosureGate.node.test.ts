// saas/tests/publicDisclosureGate.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  publicDisclosureViolations,
  isPublicReleasable,
  asksWhatPowersTheService,
  publicImplementationDisclosureReply,
} from '../lib/ai/cos/publicDisclosureGate.ts'

test('blocks the disclosure a visitor is most likely to fish for', () => {
  // This is the exact shape the owner channel is allowed to produce and the public channel is not.
  const answer = 'COS runs on Qwen/Qwen3.6-35B-A3B, an open-weight model executed by deepinfra.'
  const found = publicDisclosureViolations(answer)
  assert.ok(found.includes('infrastructure_identifier'))
  assert.ok(found.includes('model_self_attribution'))
  assert.equal(isPublicReleasable(answer), false)
})

test('blocks infrastructure and internal identifiers wherever they appear', () => {
  for (const answer of [
    'The data is stored in Supabase and deployed on Vercel.',
    'Raise COS_REASONER_MAX_TOKENS to fix this.',
    'The record is in cos_campaign_queue.',
    'See /api/cos-primary for details.',
    'Organization 8c70a96d-8d2d-4b25-b413-0e5ffb38131f owns it.',
  ]) {
    assert.equal(isPublicReleasable(answer), false, answer)
  }
})

test('blocks internal evidence labels and the provenance funnel', () => {
  assert.ok(publicDisclosureViolations('As shown in [CL#3], throughput improves.').includes('evidence_label'))
  assert.ok(publicDisclosureViolations('Learned Corpus: 40 retrieved → 0 relevant → 0 selected').includes('provenance_funnel'))
  assert.ok(publicDisclosureViolations('40 retrieved -> 1 relevant').includes('provenance_funnel'))
})

test('blocks self-attributed internal components and metrics', () => {
  assert.ok(
    publicDisclosureViolations('I rely on my Enterprise Memory and the learned corpus for this.')
      .includes('internal_component_self_attribution'),
  )
  assert.ok(
    publicDisclosureViolations('My confidence is 0.78, above the threshold of 0.72.')
      .includes('internal_metric_self_attribution'),
  )
})

// ---------------------------------------------------------------------------------------------
// False positives are the real risk: a public visitor may ask about these as general topics.
// ---------------------------------------------------------------------------------------------

test('general technical discussion of the same terms is NOT a disclosure', () => {
  for (const answer of [
    'A mixture-of-experts model activates only a subset of parameters per token, which is why a 35B-A3B model is cheaper to serve than a dense 35B one.',
    'A knowledge graph stores entities and relationships, which makes multi-hop queries cheap.',
    'Semantic caching stores embeddings of past queries so near-duplicate requests can reuse an answer.',
    'Llama and Mistral are both open-weight families; Claude and GPT-4 are not.',
    'Set your confidence threshold to 0.8 if false positives are expensive in your pipeline.',
    'Your system should fail closed when the evidence check does not pass.',
  ]) {
    assert.deepEqual(publicDisclosureViolations(answer), [], answer)
  }
})

test('ordinary business and infrastructure answers pass untouched', () => {
  for (const answer of [
    'Adam moments are FP32, so a 70B checkpoint is roughly 980 GB once master weights are counted.',
    'Check starter current and voltage under crank before replacing the starter motor.',
    'I would not renew the contract: their price rose 31% while usage fell 40%.',
    'COS is SignalBoost\u2019s own reasoning layer; implementation details are not public.',
  ]) {
    assert.deepEqual(publicDisclosureViolations(answer), [], answer)
  }
})

test('self-attribution must be nearby, not anywhere in a long answer', () => {
  // A model name far from any self-reference is general content, not a disclosure.
  const answer = `This service is powered by COS.${' Filler sentence about cooling loops.'.repeat(40)} Separately, Mistral publishes open-weight models.`
  assert.deepEqual(publicDisclosureViolations(answer), [])
})

test('empty and junk input is safe', () => {
  assert.deepEqual(publicDisclosureViolations(''), [])
  assert.deepEqual(publicDisclosureViolations('   '), [])
  assert.deepEqual(publicDisclosureViolations(undefined as unknown as string), [])
  assert.equal(isPublicReleasable('A normal answer.'), true)
})

test('the gate runs on every public answer and fails closed with no draft', () => {
  const source = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')
  assert.match(source, /const disclosures = publicDisclosureViolations\(parsed\.answer\)/)
  // Must not inherit publicScenarioScope's SignalBoost-specific exemption.
  const gateAt = source.indexOf('const disclosures = publicDisclosureViolations')
  const tail = source.slice(gateAt, gateAt + 2400)
  assert.ok(!/isSignalBoostSpecificPublicRequest/.test(tail), 'gate must apply to every public answer')
  // A draft containing internals must never be surfaced as a low-confidence draft, so the
  // failure branch must not RETURN a bestEffortReply property. (Prose mentioning the field in a
  // comment is fine — match the property assignment, not the word.)
  assert.ok(!/bestEffortReply\s*:/.test(tail.slice(0, tail.indexOf('parsed = redacted'))))
})

// ---------------------------------------------------------------------------------------------
// "What powers you?" must get the boundary, not an outage message.
// ---------------------------------------------------------------------------------------------

test('detects a question about what runs the service', () => {
  for (const prompt of [
    'What model powers COS?',
    'Which LLM do you use?',
    'what are you built on?',
    "What's under the hood?",
    'Are you ChatGPT?',
    '¿Qué modelo usa COS?',
    'Qual modelo você usa?',
    'Jaki model was napędza?',
    'Какая модель тебя питает?',
  ]) {
    assert.equal(asksWhatPowersTheService(prompt), true, prompt)
  }
})

test('ordinary questions containing the same words are not self-referential', () => {
  for (const prompt of [
    'What model of pump is best for a 100 kW rack?',
    'Which provider has the lowest egress cost?',
    'What technology should we use for checkpointing?',
    'Who runs the EU-North datacenter?',
  ]) {
    assert.equal(asksWhatPowersTheService(prompt), false, prompt)
  }
})

test('the implementation reply passes the gate it exists to satisfy', () => {
  // If this reply itself tripped the gate, the branch would loop or fail closed again.
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    const reply = publicImplementationDisclosureReply(language)
    assert.deepEqual(publicDisclosureViolations(reply), [], language)
    assert.ok(reply.length > 80, language)
  }
})

test('the implementation reply states a boundary, not an outage', () => {
  const reply = publicImplementationDisclosureReply('en')
  assert.ok(!/unavailable|try again|error|temporarily/i.test(reply))
  assert.match(reply, /do not publish|not publish/i)
})

test('unknown language falls back to English', () => {
  assert.equal(publicImplementationDisclosureReply('de'), publicImplementationDisclosureReply('en'))
  assert.equal(publicImplementationDisclosureReply(null), publicImplementationDisclosureReply('en'))
})

test('the self-referential branch runs before the redaction attempt', () => {
  const source = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')
  const branchAt = source.indexOf('asksWhatPowersTheService(userRequest)')
  const redactAt = source.indexOf('You are COS repairing a public answer that disclosed')
  assert.ok(branchAt > 0 && redactAt > 0)
  assert.ok(branchAt < redactAt, 'boundary reply must pre-empt the redaction pass')
  // It must return the reply under the field name the caller actually reads.
  const branch = source.slice(branchAt, branchAt + 400)
  assert.match(branch, /reply: publicImplementationDisclosureReply\(/)
})
