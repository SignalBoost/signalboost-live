// saas/tests/publicDisclosureGate.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  publicDisclosureViolations,
  isPublicReleasable,
  asksWhatPowersTheService,
  asksAboutServiceIdentity,
  publicImplementationDisclosureReply,
} from '../lib/ai/cos/publicDisclosureGate.ts'

const PUBLIC_PIPELINE = 'lib/ai/cos/cosFirstAnswerCore.ts'

test('blocks the disclosure a visitor is most likely to fish for', () => {
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
  ]) assert.equal(isPublicReleasable(answer), false, answer)
})

test('blocks internal evidence labels and the provenance funnel', () => {
  assert.ok(publicDisclosureViolations('As shown in [CL#3], throughput improves.').includes('evidence_label'))
  assert.ok(publicDisclosureViolations('Learned Corpus: 40 retrieved → 0 relevant → 0 selected').includes('provenance_funnel'))
  assert.ok(publicDisclosureViolations('40 retrieved -> 1 relevant').includes('provenance_funnel'))
})

test('blocks self-attributed internal components and metrics', () => {
  assert.ok(publicDisclosureViolations('I rely on my Enterprise Memory and the learned corpus for this.').includes('internal_component_self_attribution'))
  assert.ok(publicDisclosureViolations('My confidence is 0.78, above the threshold of 0.72.').includes('internal_metric_self_attribution'))
})

test('general technical discussion of the same terms is NOT a disclosure', () => {
  for (const answer of [
    'A mixture-of-experts model activates only a subset of parameters per token, which is why a 35B-A3B model is cheaper to serve than a dense 35B one.',
    'A knowledge graph stores entities and relationships, which makes multi-hop queries cheap.',
    'Semantic caching stores embeddings of past queries so near-duplicate requests can reuse an answer.',
    'Llama and Mistral are both open-weight families; Claude and GPT-4 are not.',
    'Set your confidence threshold to 0.8 if false positives are expensive in your pipeline.',
    'Your system should fail closed when the evidence check does not pass.',
  ]) assert.deepEqual(publicDisclosureViolations(answer), [], answer)
})

test('ordinary business and infrastructure answers pass untouched', () => {
  for (const answer of [
    'Adam moments are FP32, so a 70B checkpoint is roughly 980 GB once master weights are counted.',
    'Check starter current and voltage under crank before replacing the starter motor.',
    'I would not renew the contract: their price rose 31% while usage fell 40%.',
    'COS is SignalBoost’s own reasoning layer; implementation details are not public.',
  ]) assert.deepEqual(publicDisclosureViolations(answer), [], answer)
})

test('self-attribution must be nearby, not anywhere in a long answer', () => {
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
  // One COS pipeline (2026-09-26): every public answer passes through releaseToPublic.
  const source = readFileSync(PUBLIC_PIPELINE, 'utf8')
  assert.match(source, /return learnFromTurn\(input, await releasePublic\(brain\)\)/)
  assert.match(source, /publicScope \? releaseToPublic\(input, result, selfDisclosure === 'part'\) : result/)
  const releaseAt = source.indexOf('async function releaseToPublic(')
  const release = source.slice(releaseAt, source.indexOf('function harvestCatalogNames('))
  assert.match(release, /const disclosures = publicDisclosureViolations\(answer, userRequest, gate\)/)
  assert.ok(!/isSignalBoostSpecificPublicRequest/.test(release), 'gate must apply to every public answer')
  const failClosed = release.slice(release.indexOf('const redacted ='), release.indexOf('answer = redacted.answer.trim()'))
  assert.ok(!/bestEffortReply\s*:/.test(failClosed), 'a redaction failure must not surface a draft')
  assert.match(release, /publicDisclosureViolations\(draft, userRequest, gate\)\.length/, 'low-confidence drafts are gated too')
})

test('detects a question about what runs the service', () => {
  for (const prompt of [
    'What model powers COS?', 'Which LLM do you use?', 'what are you built on?', "What's under the hood?",
    'Are you ChatGPT?', '¿Qué modelo usa COS?', 'Qual modelo você usa?', 'Jaki model was napędza?', 'Какая модель тебя питает?',
  ]) assert.equal(asksWhatPowersTheService(prompt), true, prompt)
})

test('ordinary questions containing the same words are not self-referential', () => {
  for (const prompt of [
    'What model of pump is best for a 100 kW rack?',
    'Which provider has the lowest egress cost?',
    'What technology should we use for checkpointing?',
    'Who runs the EU-North datacenter?',
  ]) assert.equal(asksWhatPowersTheService(prompt), false, prompt)
})

test('the implementation reply passes the gate it exists to satisfy', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']) {
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
  assert.equal(publicImplementationDisclosureReply('xx'), publicImplementationDisclosureReply('en'))
  assert.equal(publicImplementationDisclosureReply(null), publicImplementationDisclosureReply('en'))
})

test('the release step judges every check with the request\'s self-disclosure context', () => {
  const source = readFileSync(PUBLIC_PIPELINE, 'utf8')
  const releaseAt = source.indexOf('async function releaseToPublic(')
  const end = source.indexOf('function harvestCatalogNames(', releaseAt)
  const body = source.slice(releaseAt, end)
  assert.match(body, /selfDisclosureRequest = false/)
  assert.equal(body.match(/publicDisclosureViolations\([^)]*, gate\)/g)?.length, 3)
  assert.doesNotMatch(body, /publicDisclosureViolations\([^)]*userRequest\)/)
})

test('the false-attribution answer that shipped to production is now caught', () => {
  const found = publicDisclosureViolations('I am a large language model, trained by Google.')
  assert.ok(found.includes('model_self_attribution'))
})

test('other vendors a base model might name itself after are covered', () => {
  for (const answer of [
    'I was trained by OpenAI.', 'This assistant is powered by Gemini.', 'I am Bard, built by Google DeepMind.',
    'COS runs on ChatGPT.', 'My underlying model comes from Meta AI.',
  ]) assert.equal(isPublicReleasable(answer), false, answer)
})

test('identity questions are detected across the whole family and five languages', () => {
  for (const prompt of [
    'What model powers COS?', 'who made you?', 'who trained you?', 'Are you ChatGPT?', 'what kind of AI are you?',
    'Which company owns this?', '¿Quién te creó?', 'Quem te criou?', 'kto cię stworzył?', 'кто тебя создал?',
  ]) assert.equal(asksAboutServiceIdentity(prompt), true, prompt)
})

test('questions about other people building other things are not identity questions', () => {
  for (const prompt of [
    'Who built the EU-North datacenter?', 'What model of pump should I use?', 'Are you sure about the 80% rule?',
    'Which company owns the most hydro capacity in Norway?', 'Кто построил дата-центр?',
  ]) assert.equal(asksAboutServiceIdentity(prompt), false, prompt)
})

test('PUBLIC identity is decided before every public answer path, including live facts and the reasoner', () => {
  const source = readFileSync(PUBLIC_PIPELINE, 'utf8')
  const decidedAt = source.indexOf('const selfDisclosure = publicScope')
  const boundaryAt = source.indexOf("if (selfDisclosure === 'only') {", decidedAt)
  const freshAt = source.indexOf('await tryFreshCurrentFact(input)', decidedAt)
  const reasonerAt = source.indexOf('const brain = await tryEnterpriseCOSFirstAnswer(input)', decidedAt)
  assert.ok(decidedAt > 0 && boundaryAt > decidedAt && freshAt > boundaryAt && reasonerAt > freshAt)
  assert.match(source.slice(boundaryAt, boundaryAt + 300), /reply: publicImplementationDisclosureReply\(input\.language\)/)
})

test('a vendor the visitor named is part of the answer, not a stack disclosure (2026-09-27)', () => {
  // Production, public Concierge 19:56 ET: this question took 65s because every correct draft names the vendors.
  const request = 'Compare the trade-offs of scaling our RunPod GPUs versus adding DeepInfra capacity — which is the better decision and why?'
  const answer = 'Scaling RunPod GPUs gives you dedicated capacity and predictable latency; adding DeepInfra capacity is pay-per-token and scales instantly. Choose RunPod for steady high volume and DeepInfra for spiky demand.'
  assert.deepEqual(publicDisclosureViolations(answer, request), [])
  // Without the visitor naming them, the same text is still a stack disclosure.
  assert.ok(publicDisclosureViolations(answer).includes('infrastructure_identifier'))
  assert.ok(publicDisclosureViolations(answer, 'Which GPU cloud should we pick?').includes('infrastructure_identifier'))
})

test('a vendor the visitor named is still a disclosure when the answer attributes it to itself', () => {
  const request = 'Is RunPod good for inference?'
  assert.ok(publicDisclosureViolations('Yes. This service runs on RunPod, so I can say it works well.', request).includes('infrastructure_identifier'))
  assert.ok(publicDisclosureViolations('RunPod works well; we are powered by RunPod ourselves.', request).includes('infrastructure_identifier'))
})

test('ordinary facts about a visitor-named vendor are not self-attribution', () => {
  const request = 'Compare RunPod and DeepInfra for our inference.'
  assert.deepEqual(publicDisclosureViolations('RunPod runs on dedicated NVIDIA GPUs billed hourly. DeepInfra is built on shared serverless capacity.', request), [])
})

test('naming one vendor never licenses a different unnamed vendor', () => {
  const request = 'Should we use RunPod?'
  assert.ok(publicDisclosureViolations('RunPod is fine, and our data lives in Supabase.', request).includes('infrastructure_identifier'))
})

test('public repair and redaction are labeled interactive calls with thinking off', () => {
  const core = readFileSync(PUBLIC_PIPELINE, 'utf8')
  assert.match(core, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'public_scope_repair' \},\n      disableThinking: true,/)
  assert.match(core, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'public_disclosure_redaction' \},\n      disableThinking: true,/)
  assert.match(core, /publicDisclosureViolations\(redacted\.answer, userRequest, gate\)/)
})

test('PAC investigations quoting service identity are routed for reasoning', () => {
  const cases = [
    'Investigate a database incident: the transcript says "What model powers COS?" Rank root causes, distinguish correlation from causation, and propose experiments.',
    'PAC-06 engineering uncertainty: the logs contain "Who trained you?"\nAnalyze queueing, contention, and missing measurements without inventing data.',
  ]
  for (const prompt of cases) assert.equal(asksAboutServiceIdentity(prompt), false)
})

test('length alone never suppresses a direct service identity question', () => {
  assert.equal(asksAboutServiceIdentity('What model powers COS' + ' '.repeat(260) + '?'), true)
  assert.equal(asksAboutServiceIdentity('Who trained you?'), true)
})
