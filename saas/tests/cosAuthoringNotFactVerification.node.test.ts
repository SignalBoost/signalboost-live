// saas/tests/cosAuthoringNotFactVerification.node.test.ts
//
// COS-PAC acceptance 2026-10-31: "draft a letter to my CDO asking whether my retirement can be extended" was refused
// (source=failed_closed) because the live check of the retirement rule failed. Writing the letter never required COS
// to establish the rule. A confirmed writing request now gets its draft, with the unverified rule asked about or left
// to confirm; failed_closed stays for turns where no safe useful response exists.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semanticIntentConfirmsWriting, semanticIntentRequiresFreshness, type CosSemanticTaskIntent } from '../lib/ai/cos/cosSemanticTaskIntent.ts'

const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
const between = (from: string, to: string) => {
  const start = primary.indexOf(from)
  const end = primary.indexOf(to, start + from.length)
  assert.ok(start >= 0 && end > start, `missing span ${from} .. ${to}`)
  return primary.slice(start, end)
}

const factDependentLetter: CosSemanticTaskIntent = { mode: 'content_generation', confidence: 0.95, suppliedContextPrimary: false, externalFactsRequired: true }
const factQuestion: CosSemanticTaskIntent = { mode: 'external_fact_verification', confidence: 0.95, suppliedContextPrimary: false, externalFactsRequired: true }
const unsureJudge: CosSemanticTaskIntent = { mode: 'content_generation', confidence: 0.5, suppliedContextPrimary: false, externalFactsRequired: true }

test('the intent judge, not wording, decides which live misses still get a draft', () => {
  // A fact-dependent letter still goes to live evidence first (Q15 order is unchanged)...
  assert.equal(semanticIntentRequiresFreshness(factDependentLetter), true)
  // ...and is a confirmed writing deliverable, so a failed check cannot erase it.
  assert.equal(semanticIntentConfirmsWriting(factDependentLetter), true)
  // A plain fact question keeps failing closed when the fact cannot be verified.
  assert.equal(semanticIntentConfirmsWriting(factQuestion), false)
  // An unsure judge never unlocks the draft.
  assert.equal(semanticIntentConfirmsWriting(unsureJudge), false)
})

test('both live-evidence misses try the unverified-facts draft before refusing', () => {
  const gate = between('const unverifiedFactsDraft=async()=>{', '\n  }\n')
  assert.match(gate, /if\(requestedAction\|\|hasAttachments\)return null/)
  assert.match(gate, /semanticIntentConfirmsWriting\(semanticTaskIntent\?\?await pendingCosTurnIntent\(\)\)/)
  assert.match(gate, /runFastAuthoring\(input,language,true\)/)
  assert.match(gate, /'cos-fast-authoring-unverified-facts'/)
  assert.doesNotMatch(gate, /\/[^/]*\(\?:draft\|write/, 'no word rule decides this lane')

  // Miss 1: no authoritative source found. The draft is tried before the refusal is built.
  const authorityMiss = between("      } else {\n      const unverifiedDraft=await unverifiedFactsDraft()", "fresh_failure_class:'insufficient_live_authority'")
  assert.ok(authorityMiss.indexOf('unverifiedFactsDraft()') < authorityMiss.indexOf("source:'failed_closed'"))

  // Miss 2: sources found but the grounded synthesis failed. Tried before every failed_closed exit that follows.
  const synthesisMiss = primary.indexOf('  if(freshHardFail){\n    const unverifiedDraft=await unverifiedFactsDraft()')
  assert.ok(synthesisMiss > 0)
  const reasonAt = primary.indexOf('  const reason=freshHardFail?{code:freshFailureCode!')
  assert.ok(synthesisMiss < reasonAt)
  const laterFailedClosed = [...primary.matchAll(/source:'failed_closed'|completionSource=.*'failed_closed'/g)].map(m => m.index!)
  assert.ok(laterFailedClosed.filter(i => i > reasonAt).length >= 2, 'the refusal exits remain for turns with no safe draft')
})

test('the unverified-facts draft never asserts the unverified rule and still answers "what shall I do"', () => {
  const rule = between("const UNVERIFIED_FACTS_AUTHORING_RULE='", "'\n")
  assert.match(rule, /Deliver everything requested anyway/)
  assert.match(rule, /asking the recipient to confirm, or as a \[to confirm\] placeholder, never as established fact/)
  assert.match(rule, /next steps that do not depend on the unverified fact/)
  assert.match(rule, /stating that the rule itself was not verified/)
  // Only the unverified call carries the override; the ordinary rescue call is unchanged.
  assert.match(primary, /unverifiedFacts\?UNVERIFIED_FACTS_AUTHORING_RULE:'',/)
  assert.match(primary, /const semanticFast=await runFastAuthoring\(input,language\)\n/)
  // The same independent verifier still has to accept the draft before it is released.
  const lane = between('async function runFastAuthoring(', '\n}\n')
  assert.match(lane, /verifyAnswerOutcome\(\{request:input,answer:reply,judge:cosAnswerOutcomeJudge\}\)/)
  assert.match(lane, /\]\.filter\(Boolean\)\.join\(' '\)/)
})

test('a released unverified draft is reported as an answer, not as failed_closed', () => {
  const response = between('function fastAuthoringResponse(', '\n}\n')
  assert.match(response, /source:'local_cos_reasoning'/)
  assert.match(response, /ok:true/)
})
