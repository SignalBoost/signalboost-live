import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ownerDirectedPromotionAuthority } from '../lib/ai/cos/ownerDirectedPromotionPolicy.ts'

const relevanceSource = readFileSync(new URL('../lib/ai/cos/knowledgePromotionRelevance.ts', import.meta.url), 'utf8')
const promotionSource = readFileSync(new URL('../lib/ai/cos/autoPromoteLearning.ts', import.meta.url), 'utf8')
const cronSource = readFileSync(new URL('../app/api/cron/cos-directed-study-promotion/route.ts', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('owner-directed promotion authority requires both durable provenance markers', () => {
  assert.equal(ownerDirectedPromotionAuthority(['owner_directed_study']), false)
  assert.equal(ownerDirectedPromotionAuthority(['admission_basis:owner_directed_intent']), false)
  assert.equal(ownerDirectedPromotionAuthority([
    'owner_directed_study',
    'admission_basis:owner_directed_intent',
    'study_intent:learn the supplied material',
  ]), true)
})

test('owner-directed authority bypasses only the document relevance veto, never source-kind or evidence safety', () => {
  const sourceGuard = relevanceSource.indexOf("if (!knowledgePromotionSourceAllowed(candidate.sourceKind))")
  const subjectGuard = relevanceSource.indexOf("if (!candidate.subject.trim()")
  const evidenceGuard = relevanceSource.indexOf("if (!candidate.summary.trim()")
  const ownerBypass = relevanceSource.indexOf("if (candidate.ownerDirected) return result(true, 'eligible')")
  const confidenceGuard = relevanceSource.indexOf("if (base.confidence < base.confidenceFloor)")

  assert.ok(sourceGuard >= 0)
  assert.ok(subjectGuard > sourceGuard)
  assert.ok(evidenceGuard > subjectGuard)
  assert.ok(ownerBypass > evidenceGuard)
  assert.ok(confidenceGuard > ownerBypass)
})

test('promotion prioritizes owner-directed backlog and can run in owner-only mode', () => {
  assert.match(promotionSource, /contains\('evidence', OWNER_DIRECTED_EVIDENCE\)/)
  assert.match(promotionSource, /selectOwnerDirectedPromotionCandidates/)
  assert.match(promotionSource, /options\.ownerDirectedOnly/)
  assert.match(promotionSource, /countPendingOwnerDirectedKnowledgePromotion/)
  assert.match(promotionSource, /ownerDirected: ownerDirectedPromotionAuthority\(row\.evidence\)/)
})

test('directed-study promotion is recurring, bounded, authenticated, and does not wake compute for an empty queue', () => {
  const cron = vercelConfig.crons.find((entry: any) => entry.path === '/api/cron/cos-directed-study-promotion')
  assert.ok(cron)
  assert.equal(cron.schedule, '8,23,38,53 * * * *')
  assert.match(cronSource, /auth !== `Bearer \$\{secret\}`/)
  assert.match(cronSource, /if \(pendingBefore === 0\)/)
  assert.ok(cronSource.indexOf('if (pendingBefore === 0)') < cronSource.indexOf("touchRunpodActivityLease('owner_directed_knowledge_promotion')"))
  assert.match(cronSource, /autoPromoteLearnedKnowledge\(5, deadlineMs, \{ ownerDirectedOnly: true \}\)/)
})
