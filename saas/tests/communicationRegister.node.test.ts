// saas/tests/communicationRegister.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerGuidance, ROUTINE_REGISTER, type RegisterProfile } from '../lib/ai/cos/communicationRegister.ts'
import {
  conciergeLanguageQualityInstruction,
  explicitlyPreservedCriticalTokens,
  hasAvoidableEnglishProcessJargon,
} from '../lib/ai/cos/conciergeLanguageQuality.ts'

const EDITOR = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
const MODULE = readFileSync(join(process.cwd(), 'lib/ai/cos/communicationRegister.ts'), 'utf8')
const LANGUAGE_EXECUTION = readFileSync(join(process.cwd(), 'lib/ai/cos/conciergeLanguageAcceptanceExecution.ts'), 'utf8')
const COS_ENTRYPOINT = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFirstAnswer.ts'), 'utf8')

const DELICATE: RegisterProfile = {
  sensitivity: 'delicate',
  audience: 'colleagues on a service-wide distribution list',
  risks: ['dismissive characterization of technical and support staff', 'a contested opinion stated as established fact'],
}

test('routine correspondence gets no extra guidance and no added latency cost', () => {
  assert.equal(registerGuidance(ROUTINE_REGISTER), '')
  assert.equal(registerGuidance({ sensitivity: 'routine', audience: 'a teammate', risks: ['x'] }), '')
})

test('delicate register overrides the executive concision pressure explicitly', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /THIS SECTION GOVERNS/)
  assert.match(guidance, /Concision is not the goal here/)
  assert.match(guidance, /may be longer than the source/)
})

test('the guidance forbids sharpening the writer beyond the source', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /Never sharpen the writer/)
  assert.match(guidance, /Do not convert an observation into an assertion/)
  assert.match(guidance, /Attribute less rather than more/)
})

test('disparagement is neutralized rather than politely preserved', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /drop the disparagement/)
  assert.match(guidance, /not replace it with a politer form of the same put-down/)
})

test('a contested position must acknowledge the other view and the people it could diminish', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /reasonable colleagues hold the other view/)
  assert.match(guidance, /affirm the legitimacy of the people/)
})

test('identified risks are itemized and required to be resolved', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /RISKS IDENTIFIED IN THIS DRAFT/)
  assert.match(guidance, /dismissive characterization of technical and support staff/)
  assert.match(guidance, /without dropping the writer's point/)
})

test('only delicate assumes onward forwarding', () => {
  assert.match(registerGuidance(DELICATE), /forwarded beyond its original recipients/)
  assert.ok(!/forwarded beyond/.test(registerGuidance({ sensitivity: 'careful', audience: 'a manager', risks: [] })))
})

test('careful register still receives the anti-sharpening protections', () => {
  const guidance = registerGuidance({ sensitivity: 'careful', audience: 'a manager', risks: [] })
  assert.match(guidance, /Never sharpen the writer/)
  assert.match(guidance, /CAREFUL/)
})

test('classification is semantic — no vocabulary list decides sensitivity', () => {
  assert.ok(!/\bsensitiveWords\b|\bKEYWORDS\b/.test(MODULE))
  assert.match(MODULE, /callCosReasoner/)
  assert.match(MODULE, /Judge the draft in the language it is written in/)
})

test('the register block is emitted after the executive block so it wins on conflict', () => {
  const promptRegion = EDITOR.slice(EDITOR.indexOf('CORRESPONDENCE_LAYOUT_RULES'))
  assert.ok(promptRegion.indexOf('registerBlock') > -1)
  assert.match(EDITOR, /executiveCommunicationBlock/)
  assert.ok(EDITOR.indexOf('executiveCommunicationBlock') < EDITOR.indexOf('registerBlock,'))
})

test('register and skill lookups run concurrently, not in series', () => {
  assert.match(EDITOR, /await Promise\.all\(\[\s*\n\s*retrieveEditorialSkills/)
  assert.match(EDITOR, /classifyCommunicationRegister\(editableSource\)/)
})

test('a non-routine register is reported in provenance', () => {
  assert.match(EDITOR, /Communicative Register \(\$\{register\.sensitivity\}\)/)
})

test('explicit protected literal repair has an unambiguous standalone fallback', () => {
  const prompt = 'I want to improve a customer email for project ALPHA-42. Keep ALPHA-42 unchanged.'
  assert.deepEqual(explicitlyPreservedCriticalTokens(prompt), ['ALPHA-42'])
  const instruction = conciergeLanguageQualityInstruction('en')
  assert.match(instruction, /standalone line before the answer/i)
  assert.match(instruction, /final answer MUST contain that exact literal/i)
  assert.match(COS_ENTRYPOINT, /EXPLICITLY PROTECTED LITERALS/)
  assert.match(COS_ENTRYPOINT, /every item below MUST appear verbatim in the final answer/)
  assert.match(COS_ENTRYPOINT, /required literal restoration/)
  assert.match(COS_ENTRYPOINT, /explicitly preserved literal was still missing after the bounded repair/)
})

test('avoidable English process jargon is not native-quality evidence in Spanish or Brazilian Portuguese', () => {
  const spanish = 'Compensación (Trade-off): se elimina la fricción del onboarding.'
  const portuguese = 'Um rollout amplo introduz overhead significativo de onboarding.'
  assert.equal(hasAvoidableEnglishProcessJargon(spanish, 'es'), true)
  assert.equal(hasAvoidableEnglishProcessJargon(portuguese, 'pt'), true)
  assert.equal(hasAvoidableEnglishProcessJargon('El worker procesa FFmpeg.', 'es'), false)
  assert.equal(hasAvoidableEnglishProcessJargon('O worker processa FFmpeg.', 'pt'), false)
})

test('user-supplied jargon remains discussable instead of being blindly rejected', () => {
  const source = 'Explique em português o que significa onboarding neste contrato.'
  assert.equal(hasAvoidableEnglishProcessJargon('Onboarding é o processo de integração inicial.', 'pt', source), false)
  assert.equal(hasAvoidableEnglishProcessJargon('O rollout deve ocorrer amanhã.', 'pt', source), true)
})

test('the Production acceptance executor folds avoidable jargon into the English-leakage verdict', () => {
  assert.match(LANGUAGE_EXECUTION, /hasAvoidableEnglishProcessJargon/)
  assert.match(LANGUAGE_EXECUTION, /noEnglishLeakage:\s*baseVerdicts\.noEnglishLeakage/)
  assert.match(LANGUAGE_EXECUTION, /!hasAvoidableEnglishProcessJargon\(reply, test\.language, test\.prompt\)/)
})

test('five-language quality policy explicitly rejects the observed process-jargon family', () => {
  const spanish = conciergeLanguageQualityInstruction('es')
  const portuguese = conciergeLanguageQualityInstruction('pt')
  for (const term of ['onboarding', 'rollout', 'overhead', 'trade-off', 'scope creep']) {
    const pattern = new RegExp(term.replace('-', '[- ]?'), 'i')
    assert.match(spanish, pattern)
    assert.match(portuguese, pattern)
  }
})
