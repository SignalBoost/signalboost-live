// saas/tests/communicationRegister.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerGuidance, ROUTINE_REGISTER, type RegisterProfile } from '../lib/ai/cos/communicationRegister.ts'

const EDITOR = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
const MODULE = readFileSync(join(process.cwd(), 'lib/ai/cos/communicationRegister.ts'), 'utf8')
const NEURAL = readFileSync(join(process.cwd(), 'lib/ai/cos/communicationNeuralReasoning.ts'), 'utf8')

const DELICATE: RegisterProfile = {
  sensitivity: 'delicate',
  audience: 'colleagues on a service-wide distribution list',
  objective: 'offer a constructive promotion-policy suggestion',
  relationship: 'experienced colleague addressing peers',
  voiceCues: ['candid late-career reflection'],
  emotionalStakes: ['hesitation about reopening the discussion'],
  seniorityCues: ['more than twenty years of service'],
  rhetoricalElements: ['sharp contrast should be transformed, not copied'],
  requiredTransformations: ['retain the concern while removing ridicule'],
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

test('one integrated profile preserves voice and experience without preserving risky wording', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /WRITER'S OBJECTIVE: offer a constructive promotion-policy suggestion/)
  assert.match(guidance, /candid late-career reflection/)
  assert.match(guidance, /hesitation about reopening the discussion/)
  assert.match(guidance, /more than twenty years of service/)
  assert.match(guidance, /Transform a risky metaphor, idiom, joke, or sharp contrast/)
  assert.match(guidance, /do not preserve rough syntax or risky wording merely in the name of authenticity/)
})

test('integrated profile blocks mechanical memo structure and unsupported benefits', () => {
  const guidance = registerGuidance(DELICATE)
  assert.match(guidance, /Do not impose memo headings, numbered policy-benefit lists/)
  assert.match(guidance, /Do not add claims that the proposal will improve fairness, efficiency, morale, resource use, or outcomes/)
  assert.match(guidance, /never invent rank, title, leadership status, or credentials/)
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
  assert.match(MODULE, /one integrated communication profile/)
  assert.match(MODULE, /voice_cues/)
  assert.match(MODULE, /emotional_stakes/)
  assert.match(MODULE, /seniority_cues/)
  assert.match(MODULE, /rhetorical_elements/)
})

test('task-specific register guidance follows the executive block in every neural writing and repair pass', () => {
  const occurrences = [...NEURAL.matchAll(/executiveCommunicationBlock\(input\.language\),\s*\n\s*(?:\/\/[\s\S]*?\n\s*)?input\.editorialGuidance,/g)]
  assert.equal(occurrences.length, 4)
  assert.doesNotMatch(NEURAL, /input\.editorialGuidance,\s*\n\s*(?:skillBlock\(input\.skills\),\s*\n\s*)?executiveCommunicationBlock\(input\.language\),/)
})

test('register and skill lookups run concurrently, not in series', () => {
  assert.match(EDITOR, /await Promise\.all\(\[\s*\n\s*retrieveEditorialSkills/)
  assert.match(EDITOR, /classifyCommunicationRegister\(editableSource\)/)
})

test('a non-routine register is reported in provenance', () => {
  assert.match(EDITOR, /Communicative Register \(\$\{register\.sensitivity\}\)/)
})
