import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { replanSupersededRepositoryRepair, repositoryRepairRevalidationProofCommand } from '../lib/builder/repository-repair-replan.ts'
import type { SignalBoostRepositoryRepairFreshness } from '../lib/builder/repository-repair-freshness.ts'
import type { SignalBoostRepositoryRepairTarget } from '../lib/builder/repository-repair-target.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function target(commitSha: string): SignalBoostRepositoryRepairTarget {
  return Object.freeze({
    trigger: 'failed_build_log',
    repository: 'SignalBoost/signalboost-live',
    repositoryUrl: 'https://github.com/SignalBoost/signalboost-live.git',
    branch: 'main',
    commitSha,
    fullCommitSha: commitSha,
    projectRoot: 'saas',
    pathHints: Object.freeze(['saas/tests/fullAssistantConciergeIngress.node.test.ts']),
    symbolHints: Object.freeze([]),
    missingModuleHints: Object.freeze([]),
    failedCommand: 'node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
    failureEvidence: Object.freeze(['AssertionError [ERR_ASSERTION]']),
    rawLog: 'failed build log',
  })
}

test('COS is private, Concierge is presentation, and authenticated identity owns authority', () => {
  const route = read('../app/api/cos-browser/route.ts')

  assert.match(route, /COS is the private reasoning\/orchestration layer/)
  assert.match(route, /const authenticatedOwner = access\?\.isOwner === true && Boolean\(access\.userId\)/)
  assert.match(route, /Repository authority follows the\s*\n\s*\/\/ authenticated owner identity, never the mouth/s)
  assert.match(route, /surface: browserSurface/)
  assert.match(route, /allowRepositoryRepair: ownerSoftwareAuthority\.allowRepositoryRepair && \(!operationalEvidence \|\| explicitOperationalRepair\)/)
  assert.match(route, /surface: 'concierge',[\s\S]*allowRepositoryRepair: false/)
  assert.match(route, /async function publicConciergePresentation/)
  assert.match(route, /replace\(\/\\bCOS Software Specialist\\b\/g, 'Software Specialist'\)/)
  assert.match(route, /replace\(\/\\bCOS Platform Engineer\\b\/g, 'Platform Engineer'\)/)
  assert.match(route, /replace\(\/\\bCOS\\b\/g, PUBLIC_BRAND\.name\)/)
  assert.doesNotMatch(route, /replace\(\/\\bCOS\\b\/g, 'SignalBoost'\)/)
  assert.match(route, /if \(payload\.orchestrator === 'cos'\) delete payload\.orchestrator/)
})

test('direct public Concierge cannot manufacture owner repository authority', () => {
  const publicRoute = read('../app/api/concierge/route.ts')
  assert.match(publicRoute, /surface: 'concierge'/)
  assert.match(publicRoute, /allowRepositoryRepair: false/)
  assert.doesNotMatch(publicRoute, /allowRepositoryRepair:\s*true/)
})

test('Software Specialist, not Concierge, owns Builder and Platform Engineer lifecycle', () => {
  const specialist = read('../lib/ai/cos/softwareSpecialist.ts')
  const architecture = read('../../docs/COS-CONCIERGE-SOFTWARE-SPECIALIST-ARCHITECTURE.md')

  assert.match(specialist, /enqueueBuilderJob/)
  assert.match(specialist, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(specialist, /runBuilderJob/)
  assert.match(specialist, /input\.allowRepositoryRepair && access\?\.isOwner/)
  assert.match(architecture, /Software Specialist owns software lifecycle/)
  assert.match(architecture, /Builder is a Software Specialist execution capability/)
  assert.match(architecture, /Concierge must not control Builder/)
  assert.match(architecture, /COS must not duplicate the Software Specialist's engineering state machine/)
})

test('superseded repair evidence is repinned to immutable current head with a narrow proof', () => {
  const reported = 'a'.repeat(40)
  const current = 'b'.repeat(40)
  const staleTarget = target(reported)
  const freshness: SignalBoostRepositoryRepairFreshness = Object.freeze({
    status: 'superseded',
    target: staleTarget,
    reportedCommitSha: reported,
    currentBranchHeadSha: current,
    reason: 'branch_advanced',
  })

  const replan = replanSupersededRepositoryRepair(freshness, [
    'fix it',
    `Cloning github.com/SignalBoost/signalboost-live (Branch: main, Commit: ${reported.slice(0, 7)})`,
    'AssertionError [ERR_ASSERTION]',
  ].join('\n'))

  assert.ok(replan)
  assert.equal(replan.target.fullCommitSha, current)
  assert.equal(replan.target.commitSha, current)
  assert.equal(replan.reportedCommitSha, reported)
  assert.equal(replan.currentBranchHeadSha, current)
  assert.match(replan.objective, new RegExp(`Commit: ${current}`))
  assert.match(replan.objective, new RegExp(reported))
  assert.match(replan.objective, /Reproduce the same failure on this verified current head before any edit/)
  assert.equal(repositoryRepairRevalidationProofCommand(replan.target), 'node --experimental-strip-types --test tests/fullAssistantConciergeIngress.node.test.ts')
})

test('Software Specialist treats branch advance as replan, not terminal user delegation', () => {
  const job = read('../lib/builder/repository-repair-job.ts')

  assert.match(job, /replanSupersededRepositoryRepair/)
  assert.match(job, /repairPreflight: stale \? 'superseded_replanned'/)
  assert.match(job, /revalidateSupersededCurrentHead/)
  assert.match(job, /currentHeadProof === 'passes'/)
  assert.match(job, /status: 'succeeded'/)
  assert.match(job, /no_change_required: true/)
  assert.match(job, /currentHeadProof === 'fails'/)
  assert.match(job, /Platform Engineer is continuing automatically/)
  assert.match(job, /builder_repository_target_unverified/)
  assert.doesNotMatch(job, /Re-run the current head|provide a failure from the current revision/)
})

test('the architectural invariant is permanent documentation and a mandatory deployment gate', () => {
  const architecture = read('../../docs/COS-CONCIERGE-SOFTWARE-SPECIALIST-ARCHITECTURE.md')
  const gate = read('../scripts/vercel-cos-gates.mjs')

  assert.match(architecture, /Status:\*\* normative, release-gated architecture/)
  assert.match(architecture, /COS is the private brain\. Concierge is the public mouth/)
  assert.match(architecture, /Authority belongs to identity and policy, not UI surface/)
  assert.match(architecture, /Superseded revisions are replanning events/)
  assert.match(architecture, /explicit owner approval for an intentional architectural change/)
  assert.match(gate, /tests\/cosConciergeSoftwareArchitecture\.node\.test\.ts/)
})
