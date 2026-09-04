import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getA2ASpecialistFamily } from '../a2a-host/a2a-specialist-catalog.ts'
import { conciergeBuilderRequest, pastedConciergeSourceFile } from '../lib/ai/cos/agentProgressClient.ts'
import { verifySignalBoostRepositoryRepairTargetCurrent } from '../lib/builder/repository-repair-freshness.ts'
import { publishSignalBoostRepositoryRepair } from '../lib/builder/repository-repair-writeback.ts'
import type { BuilderFile } from '../lib/builder/contracts.ts'
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
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
  const specialist = read('../lib/ai/cos/softwareSpecialist.ts')
  const repairJob = read('../lib/builder/repository-repair-job.ts')
  const repair = read('../lib/builder/repository-repair.ts')

  assert.match(specialist, /export async function tryCosSoftwareSpecialist/)
  assert.match(specialist, /isConciergeBuilderObjective/)
  assert.match(specialist, /enqueueBuilderJob/)
  assert.match(specialist, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(specialist, /input\.allowRepositoryRepair && access\?\.isOwner && access\.userId && !sourceAttached/)
  assert.match(repairJob, /const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent\(input\.target\)/)
  assert.match(repairJob, /builder_repository_target_superseded/)
  assert.match(repairJob, /builder_repository_target_unverified/)
  assert.match(repairJob, /source: 'cos-platform-engineer-preflight'/)
  assert.match(repairJob, /const claimed = await claimBuilderJob\(jobId, input\.userId\)/)
  assert.match(repairJob, /builder_repository_preflight_claim_failed/)
  assert.match(repairJob, /result:\s*\{\s*reply,\s*source: 'cos-platform-engineer-preflight'/s)
  assert.ok(repairJob.indexOf('const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent(input.target)') < repairJob.indexOf('const workspace = createSupabaseBuilderWorkspace(input.userId)'))
  assert.ok(repairJob.indexOf('const claimed = await claimBuilderJob(jobId, input.userId)') < repairJob.indexOf('await finishBuilderJob({'))
  assert.match(repair, /publishSignalBoostRepositoryRepair/)
  assert.match(specialist, /specialist_family: 'software'/)
  assert.match(specialist, /orchestrator: 'cos'/)
})

test('stale repair terminal response shows COS explanation before internal error code', () => {
  const repairJob = read('../lib/builder/repository-repair-job.ts')
  const builderRoute = read('../app/api/builder/route.ts')
  const assistantPage = read('../app/dashboard/assistant/page.tsx')

  assert.match(repairJob, /result:\s*\{\s*reply,\s*source: 'cos-platform-engineer-preflight'/s)
  assert.ok(builderRoute.indexOf('...(job.result || {})') < builderRoute.indexOf('...(job.error ? { error: job.error } : {})'))
  assert.match(assistantPage, /const directReply = data\?\.reply \|\| data\?\.error \|\| ''/)
})

test('Concierge delegates coding to COS Software Specialist without repository authority on the direct public API', () => {
  const source = read('../app/api/concierge/route.ts')
  assert.match(source, /tryCosSoftwareSpecialist/)
  assert.match(source, /surface: 'concierge'/)
  assert.match(source, /allowRepositoryRepair: false/)
  assert.doesNotMatch(source, /const builder = await directBuilder\(body, input\)/)
})

test('browser Concierge and owner Assistant both enter the canonical COS browser dispatcher', () => {
  const client = read('../lib/ai/cos/agentProgressClient.ts')
  const browser = read('../app/api/cos-browser/route.ts')
  assert.match(client, /const endpoint = builderRequest\?\.endpoint \?\? '\/api\/cos-browser'/)
  assert.doesNotMatch(client, /args\.target === 'cos' \? '\/api\/cos-browser' : '\/api\/concierge'/)
  assert.match(browser, /const access = await getAccess\(\)\.catch/)
  assert.match(browser, /const executeOwnerRequest = .*cosPrimaryPost\(routedRequest\)/)
  assert.match(browser, /const executePublicRequest = .*publicConciergePost\(routedRequest\)/)
  assert.match(browser, /const response = access\?\.isOwner[\s\S]*withPublicDeliveryScope/)
})

test('public Concierge rebuilds the support request from parsed JSON instead of wrapping a consumed request stream', () => {
  const concierge = read('../app/api/concierge/route.ts')
  assert.match(concierge, /function boundedPrimary\(req: NextRequest, body: any\)/)
  assert.match(concierge, /body: JSON\.stringify\(body\)/)
  assert.match(concierge, /const primary = supportPost\(supportRequest\)/)
  assert.match(concierge, /const primaryRun = await boundedPrimary\(req, body\)/)
  assert.doesNotMatch(concierge, /supportPost\(new NextRequest\(req\.clone\(\)\)\)/)
})

test('raw pasted TypeScript becomes a real editable Builder file instead of an empty workspace', () => {
  const objective = [
    'Please fix this code:',
    'export function add(a: number, b: number) {',
    '  return a - b',
    '}',
    'console.log(add(1, 2))',
  ].join('\n')
  const staged = pastedConciergeSourceFile(objective)
  assert.ok(staged)
  assert.equal(staged.path, 'pasted-source.ts')
  assert.match(staged.content, /^export function add/)
  assert.doesNotMatch(staged.content, /Please fix this code/)

  const request = conciergeBuilderRequest({
    messages: [{ role: 'user', content: objective }],
    attachments: [],
    context: { conversationId: '11111111-1111-4111-8111-111111111111' },
  })
  assert.ok(request)
  assert.equal(request.endpoint, '/api/builder')
  assert.deepEqual((request.body.files as Array<{ path: string }>).map(file => file.path), ['pasted-source.ts'])
})

test('an explanation-only source paste stays on ordinary COS instead of mutating code', () => {
  const objective = [
    'Explain this code:',
    '```ts',
    'export function add(a: number, b: number) {',
    '  return a + b',
    '}',
    '```',
  ].join('\n')
  assert.equal(conciergeBuilderRequest({
    messages: [{ role: 'user', content: objective }],
    context: { conversationId: '11111111-1111-4111-8111-111111111111' },
  }), null)
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

test('repository write-back is unavailable without a server-side write credential', async () => {
  const result = await publishSignalBoostRepositoryRepair({
    target: repositoryTarget('a'.repeat(40), 'main'),
    workspaceId: '11111111-1111-4111-8111-111111111111',
    files: [{ path: 'lib/a.ts', content: 'export const a = 1\n', updatedAt: 0 }],
    patch: 'diff --git a/saas/lib/a.ts b/saas/lib/a.ts',
    token: '',
  })
  assert.equal(result.repositoryWriteAllowed, false)
  assert.equal(result.repositoryWriteTaken, false)
  assert.equal(result.error, 'builder_repository_write_not_configured')
})

test('verified owner repair can publish a serialized review branch and PR but never self-merge', async () => {
  const baseSha = 'a'.repeat(40)
  const baseTreeSha = 'b'.repeat(40)
  const blobShas = ['c'.repeat(40), 'd'.repeat(40)]
  const createdTreeSha = 'e'.repeat(40)
  const createdCommitSha = 'f'.repeat(40)
  const calls: Array<{ url: string; method: string; body: string }> = []
  let blobIndex = 0
  const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = String(init.method || 'GET')
    const body = typeof init.body === 'string' ? init.body : ''
    calls.push({ url, method, body })
    if (url.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: baseSha } })
    if (url.endsWith(`/git/commits/${baseSha}`)) return jsonResponse({ tree: { sha: baseTreeSha } })
    if (url.endsWith('/git/blobs') && method === 'POST') return jsonResponse({ sha: blobShas[blobIndex++] }, 201)
    if (url.endsWith('/git/trees') && method === 'POST') return jsonResponse({ sha: createdTreeSha }, 201)
    if (url.endsWith('/git/commits') && method === 'POST') return jsonResponse({ sha: createdCommitSha }, 201)
    if (url.endsWith('/git/refs') && method === 'POST') return jsonResponse({ ref: 'refs/heads/cos/platform-repair' }, 201)
    if (url.endsWith('/pulls') && method === 'POST') return jsonResponse({ number: 1842, html_url: 'https://github.com/SignalBoost/signalboost-live/pull/1842' }, 201)
    return jsonResponse({ message: 'unexpected request' }, 500)
  }) as typeof fetch

  const files: BuilderFile[] = [{ path: 'lib/a.ts', content: 'export const a = 2\n', updatedAt: 0 }]
  const result = await publishSignalBoostRepositoryRepair({
    target: repositoryTarget(baseSha, 'main'),
    workspaceId: '11111111-1111-4111-8111-111111111111',
    files,
    patch: 'diff --git a/saas/lib/a.ts b/saas/lib/a.ts\n--- a/saas/lib/a.ts\n+++ b/saas/lib/a.ts',
    request,
    token: 'server-write-token',
  })

  assert.equal(result.repositoryWriteAllowed, true)
  assert.equal(result.repositoryWriteTaken, true)
  assert.equal(result.commitSha, createdCommitSha)
  assert.equal(result.pullRequestNumber, 1842)
  assert.match(String(result.branch), /^cos\/platform-repair-/)
  const treeCall = calls.find(call => call.url.endsWith('/git/trees'))
  assert.ok(treeCall)
  assert.match(treeCall.body, /\.github\/main-write-token/)
  assert.equal(calls.some(call => /\/merges|\/merge$|deploy/i.test(call.url)), false)
})

test('repository write-back rechecks branch freshness immediately before mutation', async () => {
  const baseSha = 'a'.repeat(40)
  const requests: string[] = []
  const request = (async (input: RequestInfo | URL) => {
    requests.push(String(input))
    return jsonResponse({ object: { sha: 'b'.repeat(40) } })
  }) as typeof fetch

  const result = await publishSignalBoostRepositoryRepair({
    target: repositoryTarget(baseSha, 'main'),
    workspaceId: '11111111-1111-4111-8111-111111111111',
    files: [{ path: 'lib/a.ts', content: 'export const a = 2\n', updatedAt: 0 }],
    patch: 'diff --git a/saas/lib/a.ts b/saas/lib/a.ts',
    request,
    token: 'server-write-token',
  })

  assert.equal(result.repositoryWriteAllowed, true)
  assert.equal(result.repositoryWriteTaken, false)
  assert.equal(result.error, 'builder_repository_write_target_superseded')
  assert.equal(requests.length, 1)
})
