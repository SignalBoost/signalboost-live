// saas/tests/cosPublicAnswersWholeRequest.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { asksAboutServiceIdentity, publicDisclosureViolations } from '../lib/ai/cos/publicDisclosureGate.ts'
import { classifyPublicSelfDisclosure } from '../lib/ai/cos/publicSelfDisclosureIntent.ts'

const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
const reply = (text: string | null) => async () => (text === null ? null : { text })

test('the word rule cannot tell a request about this service from one about the world', () => {
  // Production 2026-10-26: requests like these got the fixed "not public" reply instead of an answer.
  for (const request of [
    'Write a blog post about which AI models power modern chatbots.',
    'Report which provider runs each request in the inference routing test.',
  ]) assert.equal(asksAboutServiceIdentity(request), true, request)
})

test('the meaning-based judge returns its verdict, and no verdict when it cannot give one', async () => {
  assert.equal(await classifyPublicSelfDisclosure('What model powers you?', reply('{"self_disclosure":"only"}')), 'only')
  assert.equal(await classifyPublicSelfDisclosure('Who made you, and plan my launch.', reply('{"self_disclosure":"part"}')), 'part')
  assert.equal(await classifyPublicSelfDisclosure('Write a post about AI models.', reply('{"self_disclosure":"none"}')), 'none')
  for (const failure of [reply(null), reply('not json'), reply('{"self_disclosure":"maybe"}'), async () => { throw new Error('down') }]) {
    assert.equal(await classifyPublicSelfDisclosure('What model powers you?', failure), null)
  }
  assert.equal(await classifyPublicSelfDisclosure('   ', reply('{"self_disclosure":"only"}')), 'none')
})

test('the judge is asked about meaning in any language, with thinking off and a short deadline', async () => {
  let seen: Record<string, unknown> = {}
  await classifyPublicSelfDisclosure('¿Quién te creó?', async args => { seen = args; return { text: '{"self_disclosure":"only"}' } })
  assert.match(String(seen.systemPrompt), /Classify meaning, in any language, never keywords/)
  assert.match(String(seen.systemPrompt), /in general, or about the user's own systems, are NOT about this assistant/)
  assert.equal(seen.prompt, '¿Quién te creó?')
  assert.equal(seen.maxTokens, 24)
})

test('with the request\'s self-disclosure context, any model or vendor name in the answer is caught', () => {
  const context = { selfDisclosureRequest: true }
  // Codex on #4955: both passed the gate without context.
  assert.deepEqual(publicDisclosureViolations('Qwen.', 'What model powers COS?'), [])
  assert.deepEqual(publicDisclosureViolations('Soy un modelo de lenguaje creado por OpenAI.', '¿Quién te creó?'), [])
  assert.ok(publicDisclosureViolations('Qwen.', 'What model powers COS?', context).includes('model_self_attribution'))
  assert.ok(publicDisclosureViolations('Soy un modelo de lenguaje creado por OpenAI.', '¿Quién te creó?', context).includes('model_self_attribution'))
  assert.ok(publicDisclosureViolations('Do I run on RunPod? Yes.', 'Do you run on RunPod?', context).includes('infrastructure_identifier'))
  // Without that context, a request about models in general keeps its answer.
  assert.deepEqual(publicDisclosureViolations('Popular chatbots use models such as Llama, Qwen and GPT-4.', 'Write a post about AI models.'), [])
})

test('every public answer path runs after the verdict and is released through the public gate', () => {
  const decided = core.indexOf('const selfDisclosure = publicScope')
  assert.ok(decided > 0)
  assert.ok(core.indexOf('const directTextTransformation = await tryDirectTextTransformation(input)') > decided)
  assert.match(core, /return learnFromTurn\(input, await releasePublic\(await tryFreshCurrentFact\(input\)\)\)/)
  assert.match(core, /const looked = await releasePublic\(await tryFreshCurrentFact\(input\)\)/)
  assert.match(core, /return learnFromTurn\(input, await releasePublic\(brain\)\)/)
  assert.match(core, /publicScope \? releaseToPublic\(input, result, selfDisclosure === 'part'\) : result/)
  assert.equal(core.match(/await tryFreshCurrentFact\(input\)/g)?.length, core.match(/releasePublic\(await tryFreshCurrentFact\(input\)\)/g)?.length)
})

test('a judge that hangs (e.g. a GPU readiness wait) yields no verdict within its own deadline', async () => {
  const startedAt = Date.now()
  const verdict = await classifyPublicSelfDisclosure('What model powers you?', () => new Promise(() => {}), 50)
  assert.equal(verdict, null)
  assert.ok(Date.now() - startedAt < 1_000)
})

test('without a verdict, both detectors the old public intercept used still decide', () => {
  const decide = core.slice(core.indexOf('async function decidePublicSelfDisclosure('), core.indexOf('function ownerPlatformStackReply('))
  assert.match(decide, /const wordRule = asksAboutServiceIdentity\(request\) \|\| isPlatformStackQuestion\(request\)/)
  assert.match(decide, /if \(judged === null\) return wordRule \? 'only' : 'none'/)
  // Codex on #4955: this matched the old stack detector but not asksAboutServiceIdentity.
  assert.equal(asksAboutServiceIdentity('Tell me the LLM used by this platform.'), false)
})

test('a "none" verdict on a request longer than the judge saw is released under the strict gate', () => {
  const decide = core.slice(core.indexOf('async function decidePublicSelfDisclosure('), core.indexOf('function ownerPlatformStackReply('))
  assert.match(decide, /if \(judged === 'none' && wordRule && request\.length > PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS\) return 'part'/)
})
