// saas/tests/cosCacheVerifiedOnly.node.test.ts
// Gap analysis Q19 (campaign run 2026-10-30 13:49 UTC): the semantic cache stored answers released while the
// verifier was unavailable and replayed them, including to the verification campaign. (a) Only an answer the
// independent verifier verified, unchanged, is written to or replayed from the cache. (b) Campaign analysis requests
// carry a signed header that makes production skip the cache, so they measure live inference.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { campaignLiveInferenceRequested, campaignLiveInferenceToken } from '../lib/ai/cos/campaignLiveInference.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const SECRET = 'test-secret-with-enough-entropy-0123456789'

test('a signed campaign token is accepted once issued and refused when expired, tampered, foreign or absent', () => {
  const now = Date.UTC(2026, 9, 30, 20, 0, 0)
  const token = campaignLiveInferenceToken(now, SECRET)
  assert.ok(token)
  assert.equal(campaignLiveInferenceRequested(token, now + 5_000, SECRET), true)
  assert.equal(campaignLiveInferenceRequested(token, now + 11 * 60_000, SECRET), false, 'expired')
  assert.equal(campaignLiveInferenceRequested(token, now - 5 * 60_000, SECRET), false, 'issued in the future')
  const tampered = `${token!.slice(0, -1)}${token!.endsWith('0') ? '1' : '0'}`
  assert.equal(campaignLiveInferenceRequested(tampered, now + 5_000, SECRET), false, 'tampered signature')
  assert.equal(campaignLiveInferenceRequested(`${now + 1}${token!.slice(13)}`, now + 5_000, SECRET), false, 'timestamp swapped')
  assert.equal(campaignLiveInferenceRequested(token, now + 5_000, 'another-secret-entirely-0123456789'), false, 'other key')
  assert.equal(campaignLiveInferenceRequested(null, now, SECRET), false)
  assert.equal(campaignLiveInferenceRequested('true', now, SECRET), false)
  assert.equal(campaignLiveInferenceToken(now, null), null, 'no secret, no token')
  assert.equal(campaignLiveInferenceRequested(token, now + 5_000, null), false, 'no secret, never accepted')
})

test('the reasoner reports the verifier verdict only for the exact answer it returns', () => {
  const reasoner = read('lib/ai/cos/cosReasoner.ts')
  assert.match(reasoner, /export type CosReasonerResult = \{ text: string; reasoner: CosReasonerConfig; turnId: string; answerOutcome: AnswerOutcomeStatus \}/)
  assert.match(reasoner, /const answerOutcome: AnswerOutcomeStatus = finalOutcome && releasedAnswer === finalParsedForPolicy\?\.answer\s*\n\s*\? finalOutcome\.status\s*\n\s*: 'unverified'/)
  assert.match(reasoner, /return \{ text, reasoner: config, turnId, answerOutcome \}/)
  // Through the control plane, only a worker that reports a verdict yields one; graduates and others are unverified.
  assert.match(reasoner, /answerOutcome: execution\.result\.metadata\?\.answerOutcome === 'verified' \|\| execution\.result\.metadata\?\.answerOutcome === 'incomplete'\s*\n\s*\? execution\.result\.metadata\.answerOutcome\s*\n\s*: 'unverified',/)
  assert.match(read('lib/ai/cos/cosReasoningWorkers.ts'), /answerOutcome: reasoned\.answerOutcome,/)
})

test('only a verified, unchanged answer is written to the cache, and only verified entries are replayed', () => {
  const engine = read('lib/ai/cos/cosFirstAnswerEnterprise.ts')
  assert.match(engine, /const verifiedAnswer = reasoned\.answerOutcome === 'verified' \? withComputedArithmetic\(parseLocalResult\(reasoned\.text\)\)\?\.answer \?\? null : null/)
  assert.match(engine, /const answerVerified = verifiedAnswer !== null && parsed\.answer === verifiedAnswer/)
  assert.match(engine, /if \(!input\.disableCache && answerVerified\) await waitForCacheWritesWithinBudget\(/)
  // Both stores (exact cache and semantic memory) sit inside that one gated write.
  const write = engine.slice(engine.indexOf('if (!input.disableCache && answerVerified)'), engine.indexOf("recordAvoidedCost('local_reasoner'"))
  assert.match(write, /writeCachedAnswer\(cacheKey, storedAnswer\)/)
  assert.match(write, /knowledge\.commitToMemory\(/)
  // The only call sites of either store are the two inside the gated write (the other match is the definition).
  assert.equal((engine.match(/(?<!function )writeCachedAnswer\(|\.commitToMemory\(/g) || []).length, 2, 'no other cache write path')
  assert.equal((engine.match(/writeCachedAnswer\(cacheKey/g) || []).length, 1)
  assert.match(engine, /answerOutcome:'verified',\n\s*origin:\{/)
  // Old entries (written before this rule, while the verifier was unavailable) carry no verdict and are refused.
  assert.match(engine, /payload\?\.reply && current\.ok && payload\.answerOutcome === 'verified' &&/)
  assert.match(engine, /cached\?\.reply && cachedCurrent\.ok && cached\.answerOutcome === 'verified' &&/)
})

test('campaign analysis and routing requests skip the cache in production', () => {
  const host = read('lib/builder/campaign/hostPorts.ts')
  assert.match(host, /\[CAMPAIGN_LIVE_INFERENCE_HEADER\]: token/)
  const analysis = host.slice(host.indexOf('export async function productionAnalysis('), host.indexOf('export async function productionRouting('))
  const routing = host.slice(host.indexOf('export async function productionRouting('))
  for (const port of [analysis, routing]) assert.match(port, /headers: campaignRequestHeaders\(\),/)
  const primary = read('app/api/cos-primary/route.ts')
  assert.match(primary, /disableCache:strategyProfileRequest\|\|modelPlannedSemanticMemory\|\|modelPlannedCreativeMemory\|\|campaignLiveInferenceRequested\(req\.headers\.get\(CAMPAIGN_LIVE_INFERENCE_HEADER\)\)/)
})
