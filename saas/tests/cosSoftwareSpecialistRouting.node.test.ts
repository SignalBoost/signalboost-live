import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getA2ASpecialistFamily } from '../a2a-host/a2a-specialist-catalog.ts'
import { verifySignalBoostRepositoryRepairTargetCurrent } from '../lib/builder/repository-repair-freshness.ts'
import type { SignalBoostRepositoryRepairTarget } from '../lib/builder/repository-repair-target.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function repositoryTarget(commitSha: string, branch = 'fix/cos-primary-software-specialist-20260903'): SignalBoostRepositoryRepairTarget {
  return Object.freeze({
    trigger: 'failed_build_log',
    repository: 'SignalBoost/signalboost-live',
    repositoryUrl: 'https://github.com/SignalBoost/signalboost-live.git',
    branch,
    commitSha,
    fullCommitSha: commitSha,
    projectRoot: 'saas',
    pathHints: Object.freeze(['saas/tests/builderTransportRecovery.node.test.ts']),
    symbolHints: Object.freeze([]),
    failedCommand: 'node --test tests/builderTransportRecovery.node.test.ts',
    failureEvidence: Object.freeze(['AssertionError [ERR_ASSERTION]']),
    rawLog: 'failed build log',
  })
}

function branchResponse(sha: string, status = 200): Response {
  return new Response(JSON.stringify({ object: { sha } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('Software Specialist is a canonical proficient specialist family with governed engineering skills', () => {
  const family = getA2ASpecialistFamily('software')
  assert.equal(family.displayName, 'Software Specialist')
  assert.match(family.purpose, /Broadly proficient/i)
  assert.deepEqual(
    family.skills.map(skill => skill.skillId),
    ['software.analyze', 'software.build', 'software.repair', 'software.platform-repair', 'software.verify'],
  )
  assert.equal(family.skills.find(skill => skill.skillId === 'software.platform-repair')?.risk, 'write')
})

test('repository repair preflight accepts only the current branch head', async () => {
  const sha = 'a'.repeat(40)
  const result = await verifySignalBoostRepositoryRepairTargetCurrent(
    repositoryTarget(sha),
    (async input => {
      assert.match(String(input), /git\/ref\/heads\/fix\/cos-primary-software-specialist-20260903$/)
      return branchResponse(sha)
    }) as typeof fetch,
  )

  assert.equal(result.status, 'current')
  assert.equal(result.reportedCommitSha, sha)
  assert.equal(result.currentBranchHeadSha, sha)
})

test('repository repair preflight rejects a superseded failed commit without launching repair', async () => {
  const reported = 'a'.repeat(40)
  const current = 'b'.repeat(40)
  const result = await verifySignalBoostRepositoryRepairTargetCurrent(
    repositoryTarget(reported),
    (async () => branchResponse(current)) as typeof fetch,
  )

  assert.equal(result.status, 'superseded')
  assert.equal(result.reportedCommitSha, reported)
  assert.equal(result.currentBranchHeadSha, current)
  assert.equal(result.reason, 'branch_advanced')
})

test('repository repair preflight fails closed when current branch head cannot be verified', async () => {
  const result = await verifySignalBoostRepositoryRepairTargetCurrent(
    repositoryTarget('a'.repeat(40)),
    (async () => branchResponse('', 404)) as typeof fetch,
  )

  assert.equal(result.status, 'unverifiable')
  assert.equal(result.reason, 'branch_head_unavailable')
})

test('COS Software Specialist owns Builder and owner Platform Engineer execution seams', () => {
  const source = read('../lib/ai/cos/softwareSpecialist.ts')
  assert.match(source, /export async function tryCosSoftwareSpecialist/)
  assert.match(source, /isConciergeBuilderObjective/)
  assert.match(source, /enqueueBuilderJob/)
  assert.match(source, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(source, /input\.allowRepositoryRepair && access\?\.isOwner && access\.userId && !sourceAttached/)
  assert.match(source, /const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent\(target\)/)
  assert.match(source, /cos-platform-engineer-stale-target/)
  assert.match(source, /cos-platform-engineer-target-unverified/)
  assert.ok(source.indexOf('const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent(target)') < source.indexOf('return enqueueRepositoryRepair({'))
  assert.match(source, /specialist_family: 'software'/)
  assert.match(source, /orchestrator: 'cos'/)
})

test('Concierge delegates coding to COS Software Specialist without repository authority', () => {
  const source = read('../app/api/concierge/route.ts')
  assert.match(source, /tryCosSoftwareSpecialist/)
  assert.match(source, /surface: 'concierge'/)
  assert.match(source, /allowRepositoryRepair: false/)
  assert.doesNotMatch(source, /const builder = await directBuilder\(body, input\)/)
})

test('owner Assistant enters the canonical COS browser dispatcher before specialist selection', () => {
  const client = read('../lib/ai/cos/agentProgressClient.ts')
  assert.match(client, /args\.target === 'cos' \? '\/api\/cos-browser' : '\/api\/concierge'/)
  assert.doesNotMatch(client, /args\.target === 'cos' \? '\/api\/cos-primary' : '\/api\/concierge'/)
})

test('owner Assistant uses the same Software Specialist and no longer jumps to Concierge for coding', () => {
  const source = read('../app/api/cos-browser/route.ts')
  assert.match(source, /tryCosSoftwareSpecialist/)
  assert.match(source, /surface: 'assistant'/)
  assert.match(source, /allowRepositoryRepair: true/)
  assert.match(source, /withRunpodWakePermission\(permission, \(\) => cosPrimaryPost\(routedRequest\)\)/)
  assert.doesNotMatch(source, /legacyConciergePost/)
})

test('surface authority remains asymmetric even though the software execution path is shared', () => {
  const concierge = read('../app/api/concierge/route.ts')
  const assistant = read('../app/api/cos-browser/route.ts')
  const specialist = read('../lib/ai/cos/softwareSpecialist.ts')

  assert.match(concierge, /allowRepositoryRepair: false/)
  assert.match(assistant, /allowRepositoryRepair: true/)
  assert.match(specialist, /ownerAuthorized: access\?\.isOwner === true/)
  assert.match(specialist, /Public Concierge intentionally receives guest access under public-delivery scope/)
})
