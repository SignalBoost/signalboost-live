// saas/tests/cosFreshEvidenceWriting.node.test.ts
// Gap analysis Q15, owner retest 2026-10-30 19:45 America/Asuncion: a request to draft a letter to the user's CDO about
// extending retirement past 65, "and what shall I do", gathered live sources and then released only "I found current
// sources, but the drafted answer did not meet the verification requirement". The factual-answer filter keeps only
// cited sentences and drops every first-person sentence, so a letter in the user's voice was cut to fragments or
// rejected whole. A writing request on live evidence now gets its own prompt and acceptance, written by the full COS
// answer turn (whose independent verifier checks that the letter AND the advice are both delivered).
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  acceptFreshEvidenceGroundedAnswer,
  acceptFreshEvidenceWrittenDeliverable,
  decodeFreshEvidenceWritingReply,
  freshEvidenceWritingPrompt,
} from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const request = 'draft a letter to my CDO - I work for the DoS as DTO rover - asking whether, since I will be 65 next year, my retirement can be extended for another 5 years, and what shall I do if it is true'
// Synthetic evidence shaped like the real sources (statute text and the agency manual).
const sources = [
  { id: 'LIVE1', title: '22 U.S. Code § 4052 - Mandatory retirement', url: 'https://www.law.cornell.edu/uscode/text/22/4052', snippet: 'A participant shall be retired at age 65. The Secretary may retain a participant for a period not to exceed 5 years if the Secretary determines that retention is in the public interest.' },
  { id: 'LIVE2', title: 'Foreign Affairs Manual 3 FAM 6210', url: 'https://fam.state.gov/fam/03fam/03fam6210.html', snippet: 'Mandatory retirement at age 65; retention in the public interest may be authorized.' },
] as any[]
const letter = [
  'Dear [CDO name],',
  '',
  'I turn 65 next year, and I understand the law allows the Secretary to retain a member for up to five years beyond 65 when retention is in the public interest [LIVE1].',
  'Could you confirm whether this applies to my position as a DTO rover, and what the request process and timeline would be?',
  '',
  'Sincerely,',
  '[Your name]',
  '',
  'What to do: ask your CDO now, well before your 65th birthday, and be ready to show why your retention serves the public interest [LIVE2].',
].join('\n')

test('the factual-answer filter cannot carry a letter: it strips it to fragments or rejects it whole', () => {
  // Advice not in the first person: the letter survives only as cited fragments (greeting, ask, sign-off removed).
  const stripped = acceptFreshEvidenceGroundedAnswer({ text: letter, input: request, sources })
  for (const part of ['Dear [CDO name],', 'Could you confirm whether this applies', 'Sincerely,', 'I turn 65 next year']) {
    assert.ok(!stripped.answer.includes(part), `the factual filter removes: ${part}`)
  }
  // Every cited fact inside a first-person sentence: rejected whole, the 19:45 reply.
  const firstPerson = letter.replace(/What to do: .*$/m, 'I would also like to know whether I should be ready to show why my retention serves the public interest [LIVE2].')
  const rejected = acceptFreshEvidenceGroundedAnswer({ text: firstPerson, input: request, sources })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.reason, 'process_narration')
})

test('the written-deliverable acceptance releases the whole letter and the advice, with sources', () => {
  const accepted = acceptFreshEvidenceWrittenDeliverable({ text: letter, input: request, sources })
  assert.equal(accepted.ok, true, String(accepted.reason))
  for (const part of ['Dear [CDO name],', 'I turn 65 next year', 'Could you confirm whether this applies', 'Sincerely,', '[Your name]', 'What to do:']) {
    assert.ok(accepted.reply.includes(part), `kept: ${part}`)
  }
  assert.deepEqual(accepted.citedSourceIds, ['LIVE1', 'LIVE2'])
  assert.match(accepted.reply, /\n\nSources: \[LIVE1\] \(https:\/\/www\.law\.cornell\.edu\/uscode\/text\/22\/4052\) and \[LIVE2\] \(https:\/\/fam\.state\.gov\/fam\/03fam\/03fam6210\.html\)$/)
})

test('a letter that ends on its closing keeps the closing and the signature placeholder', () => {
  const advice = 'What to do: ask your CDO now, well before your 65th birthday, and be ready to show why your retention serves the public interest [LIVE2].'
  const closingLast = [advice, '', letter.replace(advice, '').trim()].join('\n')
  assert.ok(closingLast.trimEnd().endsWith('Sincerely,\n[Your name]'))
  const accepted = acceptFreshEvidenceWrittenDeliverable({ text: closingLast, input: request, sources })
  assert.equal(accepted.ok, true, String(accepted.reason))
  assert.ok(accepted.answer.endsWith('Sincerely,\n[Your name]'), 'closing kept')
})

test('deterministic checks still hold for writing: real ids only, at least one source, safe text', () => {
  const invented = acceptFreshEvidenceWrittenDeliverable({ text: `${letter}\nAnother rule applies [LIVE9].`, input: request, sources })
  assert.equal(invented.ok, true)
  assert.ok(!invented.reply.includes('[LIVE9]'), 'an id that was not retrieved this turn is removed')
  const uncited = acceptFreshEvidenceWrittenDeliverable({ text: letter.replace(/\s*\[LIVE\d\]/g, ''), input: request, sources })
  assert.equal(uncited.ok, false)
  assert.equal(uncited.reason, 'no_evidence_cited')
  assert.equal(acceptFreshEvidenceWrittenDeliverable({ text: '  ', input: request, sources }).reason, 'empty_answer')
})

test('the writing prompt asks for every part, keeps acronyms as written, and forbids invented facts', () => {
  const { systemPrompt, prompt } = freshEvidenceWritingPrompt({ input: request, sources, retrievedAt: '2026-10-30T22:45:00Z', language: 'en' })
  assert.match(systemPrompt, /Deliver EVERY part the user asked for/)
  assert.match(systemPrompt, /give both: the finished piece of writing, then a short, practical section on what to do/)
  assert.match(systemPrompt, /Keep names and acronyms as the user wrote them unless the request or the evidence states what they stand for; never guess an expansion\./)
  assert.match(systemPrompt, /never invent a rule, number or citation/)
  assert.match(systemPrompt, /Return ONLY strict JSON: \{"answer":/)
  assert.ok(prompt.includes(request))
  assert.ok(prompt.includes('[LIVE1]') || prompt.includes('LIVE1'))
})

test('a writing turn on live evidence is written by the full COS answer turn, chosen by the intent judge', () => {
  const synthesis = read('lib/ai/cos/freshEvidenceLocalSynthesis.ts')
  assert.match(synthesis, /if \(args\.deliverable === 'writing'\) return writtenDeliverableOnEvidence\(args\)/)
  const writing = synthesis.slice(synthesis.indexOf('async function writtenDeliverableOnEvidence('), synthesis.indexOf('export async function synthesizeFreshEvidenceLocally('))
  // writesUserAnswer: the reasoner's verifier and completion loop run, and the turn gets the answer window.
  assert.match(writing, /writesUserAnswer: true,/)
  assert.match(writing, /acceptFreshEvidenceWrittenDeliverable\(\{ text: writingText, input: args\.input, sources: args\.sources \}\)/)
  assert.doesNotMatch(writing, /acceptFreshEvidenceGroundedAnswer\(/)
  const primary = read('app/api/cos-primary/route.ts')
  assert.match(primary, /const freshDeliverable=async\(\):Promise<'answer'\|'writing'>=>\(\(semanticTaskIntent\?\?await pendingCosTurnIntent\(\)\)\?\.mode==='content_generation'\?'writing':'answer'\)/)
  assert.match(primary, /synthesizeFreshEvidenceLocally\(\{input:lookupInput,sources:freshSources,retrievedAt:freshRetrievedAt,language,deliverable:await freshDeliverable\(\)\}\)/)
  assert.match(primary, /synthesizeFreshEvidenceExternally\(\{ input: lookupInput, sources:freshSources,retrievedAt:freshRetrievedAt,language,deliverable:await freshDeliverable\(\)\}\)/)
  assert.match(read('lib/ai/cos/freshEvidenceExternalSynthesis.ts'), /const local = await synthesizeFreshEvidenceLocally\(args\)/)
})

test('grounded correspondence decodes source-cited JSON without a confidence field', () => {
  const envelope = JSON.stringify({ answer: letter })
  const decoded = decodeFreshEvidenceWritingReply(envelope)
  assert.equal(decoded, letter)
  assert.equal(acceptFreshEvidenceWrittenDeliverable({ text: decoded!, input: request, sources }).ok, true)
})

test('grounded correspondence accepts plain cited prose but not malformed JSON or uncited output', () => {
  const decoded = decodeFreshEvidenceWritingReply(letter)
  assert.equal(decoded, letter)
  assert.equal(acceptFreshEvidenceWrittenDeliverable({ text: decoded!, input: request, sources }).ok, true)
  assert.equal(decodeFreshEvidenceWritingReply('{"answer":"unfinished'), null)
  const uncited = decodeFreshEvidenceWritingReply('Dear CDO, please confirm my options. Sincerely, DTO rover.')
  assert.equal(acceptFreshEvidenceWrittenDeliverable({ text: uncited!, input: request, sources }).ok, false)
})

test('fresh-writing transport uses source-validated decoded prose when confidence is absent', () => {
  const synthesis = read('lib/ai/cos/freshEvidenceLocalSynthesis.ts')
  assert.match(synthesis, /const decodedWriting = decodeFreshEvidenceWritingReply\\(result\\?\\.text \\|\\| ''\\)/)
  assert.match(synthesis, /const writingText = decodedWriting \\?\\? \\(parsed\\?\\.truncated \\? null : parsed\\?\\.answer \\|\\| null\\)/)
  // The generic parser may mark a complete confidence-free envelope as truncated.
  // The transport must prefer the strictly decoded complete answer in that case.
  const complete = JSON.stringify({ answer: letter })
  assert.equal(decodeFreshEvidenceWritingReply(complete), letter)
  assert.equal(decodeFreshEvidenceWritingReply('{"answer":"unfinished'), null)
  assert.match(synthesis, /acceptFreshEvidenceWrittenDeliverable\(\{ text: writingText, input: args\.input, sources: args\.sources \}\)/)
})
