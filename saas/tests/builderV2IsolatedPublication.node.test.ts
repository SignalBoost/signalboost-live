// saas/tests/builderV2IsolatedPublication.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ISOLATED_REPOSITORY_NAME, mergeVerifiedIsolatedPullRequest, publishVerifiedIsolatedProject, validateIsolatedFiles, verifyIsolatedPreview, isolatedDeploymentFiles, isolatedPreviewProbe, wantsIsolatedPublication } from '../lib/builder/isolated-publication.ts'

const files = [{ path: 'src/add.js', content: 'module.exports = (a,b) => a+b', updatedAt: Date.now() }]
const jobKey = '6b3a4e35-5bcb-4f21-a2d7-9cf4c841c25e'
const sha = (symbol: string) => symbol.repeat(40)

// A GitHub with one pre-created repository. `repository` overrides the repo lookup answer.
function github(options: { repository?: Response; defaultRef?: Response } = {}) {
  const calls: { path: string; method: string; body: any }[] = []
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method || 'GET'
    const path = new URL(String(url)).pathname
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (path === '/repos/signalboost/builder-isolated' || path === '/repos/SignalBoost/builder-isolated') {
      return options.repository ?? Response.json({ full_name: 'SignalBoost/builder-isolated', private: true, default_branch: 'main' })
    }
    if (path.endsWith('/git/ref/heads/main')) return options.defaultRef ?? Response.json({ object: { sha: sha('a') } })
    if (path.endsWith('/git/commits/' + sha('a'))) return Response.json({ tree: { sha: sha('b') } })
    if (path.endsWith('/git/blobs')) return Response.json({ sha: sha('c') })
    if (path.endsWith('/git/trees')) return Response.json({ sha: sha('d') })
    if (path.endsWith('/git/commits')) return Response.json({ sha: sha('e') })
    if (path.endsWith('/git/refs')) return Response.json({ ref: 'ok' }, { status: 201 })
    if (path.endsWith('/pulls')) return Response.json({ number: 3, html_url: 'https://github.com/SignalBoost/builder-isolated/pull/3' })
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }) as typeof fetch
  return { calls, request }
}
const publish = (owner: string, request: typeof fetch) =>
  publishVerifiedIsolatedProject({ owner, jobKey, token: 'test', files, verified: true, authorized: true, request })

test('isolated publisher rejects unverified work and unsafe paths before network calls', async () => {
  let calls = 0
  const request = (async () => { calls++; throw new Error('network forbidden') }) as typeof fetch
  const base = { owner: 'SignalBoost', jobKey, token: 'test', files, request }
  await assert.rejects(publishVerifiedIsolatedProject({ ...base, verified: false, authorized: true }), /not_authorized/)
  await assert.rejects(publishVerifiedIsolatedProject({ ...base, verified: true, authorized: false }), /not_authorized/)
  await assert.rejects(publishVerifiedIsolatedProject({ ...base, jobKey: '../main', verified: true, authorized: true }), /destination_invalid/)
  assert.throws(() => validateIsolatedFiles([{ ...files[0], path: '../secret' }]), /path_rejected/)
  assert.throws(() => validateIsolatedFiles([{ ...files[0], path: '.env.local' }]), /path_rejected/)
  assert.equal(calls, 0)
})

// Production 2026-10-21: creating a repository per job was refused (HTTP 403). Every job now publishes into the one
// pre-created private repository, so the token needs only Contents + Pull requests there.
// Owner asked the same day for PR #4 to be merged: the PR now targets the default branch, and each job's files sit in
// their own folder so concurrent jobs can never conflict there.
test('a verified job is published into the fixed private repository as a draft PR to the default branch, in its own folder', async () => {
  const gh = github()
  const result = await publish('SignalBoost', gh.request)
  assert.equal(ISOLATED_REPOSITORY_NAME, 'builder-isolated')
  assert.equal(result.repository, 'SignalBoost/builder-isolated')
  assert.equal(result.pullRequestNumber, 3)
  assert.equal(result.commitSha, sha('e'))
  assert.equal(gh.calls[0].path, '/repos/SignalBoost/builder-isolated', 'the repository is looked up first')
  assert.ok(!gh.calls.some(call => call.path === '/user/repos' || call.path.startsWith('/orgs/')), 'no repository is ever created')
  const refs = gh.calls.filter(call => call.path.endsWith('/git/refs')).map(call => call.body)
  assert.deepEqual(refs, [{ ref: `refs/heads/builder/${jobKey}/verified`, sha: sha('e') }], 'the default branch is never written directly')
  const tree = gh.calls.find(call => call.path.endsWith('/git/trees'))!.body
  assert.deepEqual(tree.tree.map((entry: any) => entry.path), [`projects/${jobKey}/src/add.js`])
  assert.equal(tree.base_tree, sha('b'))
  const pr = gh.calls.at(-1)!
  assert.equal(pr.body.draft, true, 'a draft until the preview is verified')
  assert.equal(pr.body.base, 'main')
  assert.equal(pr.body.head, `builder/${jobKey}/verified`)
  assert.equal(gh.calls.find(call => call.path.endsWith('/git/commits') && call.method === 'POST')?.body.parents[0], sha('a'))
})

test('the owner name is matched without case and published under GitHub\'s canonical name', async () => {
  const gh = github()
  const result = await publish('signalboost', gh.request)
  assert.equal(result.repository, 'SignalBoost/builder-isolated')
  assert.ok(gh.calls.some(call => call.path === '/repos/SignalBoost/builder-isolated/pulls'))
})

test('a missing or inaccessible repository is named before any write', async () => {
  const gh = github({ repository: Response.json({ message: 'Not Found' }, { status: 404 }) })
  await assert.rejects(publish('SignalBoost', gh.request), /^Error: builder_isolated_repository_unavailable$/)
  assert.equal(gh.calls.length, 1)
})

test('a public repository is refused before any write', async () => {
  const gh = github({ repository: Response.json({ full_name: 'SignalBoost/builder-isolated', private: false, default_branch: 'main' }) })
  await assert.rejects(publish('SignalBoost', gh.request), /builder_isolated_repository_not_private/)
  assert.equal(gh.calls.length, 1)
})

test('a repository created without a first commit is named, not reported as a raw 409', async () => {
  const gh = github({ defaultRef: Response.json({ message: 'Git Repository is empty.' }, { status: 409 }) })
  await assert.rejects(publish('SignalBoost', gh.request), /builder_isolated_repository_empty/)
  assert.ok(!gh.calls.some(call => call.method === 'POST'))
})

test('a refused write names the step it failed at', async () => {
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/git/refs')) return Response.json({ message: 'Resource not accessible' }, { status: 403 })
    return github().request(url, init)
  }) as typeof fetch
  await assert.rejects(publish('SignalBoost', request), /builder_isolated_github_create_head_branch_http_403/)
})

test('the job id names branches and explicit fresh repos are permitted', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /owner, jobKey: job\.id,/)
  assert.doesNotMatch(runner, /repositoryName/)
  const publisher = readFileSync(new URL('../lib/builder/isolated-publication.ts', import.meta.url), 'utf8')
  assert.match(publisher, /create_repository/)
  assert.match(runner, /newRepository:/)
})

test('preview uses exact verified GitHub SHA and checks live endpoint', async () => {
  const sha = 'a'.repeat(40)
  const calls: string[] = []
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    if (String(url).endsWith('/v13/deployments') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.meta.builderCommitSha, sha)
      assert.equal(body.meta.builderRepository, 'SignalBoost/builder-isolated-test')
      assert.equal(body.files[0].file, 'src/add.js')
      assert.equal(body.files[0].data, files[0].content)
      assert.equal(body.target, undefined, 'Vercel Preview must omit target')
      return Response.json({ id: 'dpl_abc123' })
    }
    if (String(url).endsWith('/v13/deployments/dpl_abc123')) {
      return Response.json({ readyState: 'READY', url: 'builder-test.vercel.app' })
    }
    if (String(url) === 'https://builder-test.vercel.app/') return new Response('<h1>OK</h1>', { status: 200 })
    throw new Error('unexpected request')
  }) as typeof fetch
  const result = await verifyIsolatedPreview({
    token: 'test', projectId: 'prj_abc123', repository: 'SignalBoost/builder-isolated-test',
    commitSha: sha, files, deadlineAt: Date.now() + 60_000, request,
  })
  assert.equal(result.status, 'verified')
  assert.equal(result.previewUrl, 'https://builder-test.vercel.app')
  assert.equal(result.endpointUrl, 'https://builder-test.vercel.app/')
  assert.equal(result.httpStatus, 200)
  assert.equal(calls.length, 3)
  assert.equal(wantsIsolatedPublication('Create an isolated Node.js repo, open a PR and deploy a preview.'), true)
})

test('preview rejects deadline expiry before external effects', async () => {
  let called = false
  await assert.rejects(verifyIsolatedPreview({
    token: 'test', projectId: 'prj_abc123', repository: 'SignalBoost/builder-isolated-test',
    commitSha: 'a'.repeat(40), files, deadlineAt: Date.now() - 1,
    request: (async () => { called = true; throw new Error('unexpected') }) as typeof fetch,
  }), /deadline_exceeded/)
  assert.equal(called, false)
})


test('preview returns the sanitized Vercel validation code on deployment 400', async () => {
  const request = (async () => Response.json({ error: { code: 'invalid_deployment_target', message: 'untrusted detail' } }, { status: 400 })) as typeof fetch
  await assert.rejects(verifyIsolatedPreview({
    token: 'test', projectId: 'prj_abc123', repository: 'SignalBoost/builder-isolated-test',
    commitSha: 'a'.repeat(40), files, deadlineAt: Date.now() + 60_000, request,
  }), /^Error: builder_isolated_vercel_http_400_invalid_deployment_target$/)
})

test('Node server export is published with a deterministic Vercel function adapter', () => {
  const source = [...files, { path: 'index.js', content: "const http = require('http'); const server = http.createServer((req,res)=>res.end('ok')); module.exports = server;", updatedAt: Date.now() }]
  const adapted = isolatedDeploymentFiles(source)
  assert.equal(adapted.length, source.length + 2)
  assert.equal(adapted.find(f => f.path === 'index.js')?.content, source[1].content)
  assert.match(adapted.find(f => f.path === 'api/index.js')?.content || '', /server.emit/)
  assert.equal(JSON.parse(adapted.find(f => f.path === 'vercel.json')?.content || '{}').rewrites[0].destination, '/api/index')
})

test('acceptance probe uses the exact requested GET and expected JSON', () => {
  const objective = 'GET /sum?a=2&b=3\n\nExpected response:\n```json\n{"total":5}\n```'
  assert.deepEqual(isolatedPreviewProbe(objective), { path: '/sum?a=2&b=3', expected: { total: 5 } })
  assert.throws(() => isolatedPreviewProbe('GET /sum?a=2&b=3'), /expected_response_missing/)
})

test('requested endpoint must return matching JSON, not merely homepage success', async () => {
  const objective = 'GET /sum?a=2&b=3\nExpected response:\n```json\n{"total":5}\n```'
  const seen: string[] = []
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(String(url))
    if (init?.method === 'POST') return Response.json({ id: 'dpl_valid123' })
    if (String(url).endsWith('/v13/deployments/dpl_valid123')) return Response.json({ readyState: 'READY', url: 'example.vercel.app' })
    return Response.json({ total: 4 }, { status: 200 })
  }) as typeof fetch
  await assert.rejects(verifyIsolatedPreview({
    token: 'test', projectId: 'prj_abc123', repository: 'SignalBoost/builder-isolated',
    commitSha: 'a'.repeat(40), files, objective, deadlineAt: Date.now() + 60_000, request,
  }), /endpoint_response_mismatch/)
  assert.equal(seen.at(-1), 'https://example.vercel.app/sum?a=2&b=3')
})

// A GitHub where the owner is a personal account or an organization and the job's repository does not exist yet.
function freshGitHub(options: { ownerType?: string; create?: Response; lookup?: Response; refPendingFor?: number; lookupPendingFor?: number } = {}) {
  const calls: { path: string; method: string; body: any }[] = []
  const name = `builder-${jobKey}`
  let pending = options.refPendingFor ?? 0
  let lookupPending = options.lookupPendingFor ?? 0
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    const method = init?.method || 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path === '/users/SignalBoost') return Response.json({ login: 'SignalBoost', type: options.ownerType ?? 'User' })
    if ((path === '/user/repos' || path === '/orgs/SignalBoost/repos') && method === 'POST')
      return options.create ?? Response.json({ full_name: `SignalBoost/${name}`, private: true }, { status: 201 })
    if (path === `/repos/SignalBoost/${name}`) {
      if (lookupPending-- > 0) return Response.json({ message: 'Not Found' }, { status: 404 })
      return options.lookup ?? Response.json({ full_name: `SignalBoost/${name}`, private: true, default_branch: 'main' })
    }
    if (path.endsWith('/git/ref/heads/main')) {
      if (pending-- > 0) return Response.json({ message: 'Git Repository is empty.' }, { status: 409 })
      return Response.json({ object: { sha: sha('a') } })
    }
    if (path.endsWith('/git/commits/' + sha('a'))) return Response.json({ tree: { sha: sha('b') } })
    if (path.endsWith('/git/blobs')) return Response.json({ sha: sha('c') })
    if (path.endsWith('/git/trees')) return Response.json({ sha: sha('d') })
    if (path.endsWith('/git/commits')) return Response.json({ sha: sha('e') })
    if (path.endsWith('/git/refs')) return Response.json({ ref: 'ok' }, { status: 201 })
    if (path.endsWith('/pulls')) return Response.json({ number: 1, html_url: `https://github.com/SignalBoost/${name}/pull/1` })
    return Response.json({ error: 'unexpected' }, { status: 404 })
  }) as typeof fetch
  return { calls, request, name }
}
const publishFresh = (request: typeof fetch) => publishVerifiedIsolatedProject({
  owner: 'SignalBoost', jobKey, token: 'test', files, verified: true, authorized: true, newRepository: true, request,
})

// Production 2026-10-21: SignalBoost is a personal account, so creating under /orgs/SignalBoost answered 404.
test('a new private repository is created where the owner lives: /user for a personal account, /orgs for an organization', async () => {
  for (const [ownerType, endpoint] of [['User', '/user/repos'], ['Organization', '/orgs/SignalBoost/repos']] as const) {
    const gh = freshGitHub({ ownerType })
    const result = await publishFresh(gh.request)
    assert.equal(result.repository, `SignalBoost/${gh.name}`, ownerType)
    assert.equal(gh.calls[0].path, '/users/SignalBoost', 'the owner type is read first')
    const create = gh.calls[1]
    assert.equal(create.path, endpoint, ownerType)
    assert.deepEqual([create.body.name, create.body.private, create.body.auto_init], [gh.name, true, true])
    assert.ok(!gh.calls.some(call => call.path.startsWith('/repos/SignalBoost/builder-isolated')), 'never the shared repository')
    const tree = gh.calls.find(call => call.path.endsWith('/git/trees'))!.body
    assert.deepEqual(tree.tree.map((entry: any) => entry.path), ['src/add.js'], 'a dedicated repository holds the job at its root')
    assert.equal(gh.calls.at(-1)?.body.base, 'main')
  }
})

test('a refused repository creation fails closed with a named reason and no shared fallback', async () => {
  for (const status of [403, 404]) {
    const gh = freshGitHub({ create: Response.json({ message: 'Forbidden' }, { status }) })
    await assert.rejects(publishFresh(gh.request), new RegExp(`^Error: builder_isolated_repository_creation_not_permitted_${status}$`))
    assert.deepEqual(gh.calls.map(call => call.path), ['/users/SignalBoost', '/user/repos'])
  }
})

test('a repository created somewhere else, or public, or unreadable by the token is refused before any write', async () => {
  const elsewhere = freshGitHub({ create: Response.json({ full_name: `someone-else/builder-${jobKey}`, private: true }, { status: 201 }) })
  await assert.rejects(publishFresh(elsewhere.request), /builder_isolated_created_repository_invalid/)
  const unreadable = freshGitHub({ lookup: Response.json({ message: 'Not Found' }, { status: 404 }) })
  await assert.rejects(publishFresh(unreadable.request), /builder_isolated_created_repository_not_accessible/)
  for (const gh of [elsewhere, unreadable]) assert.ok(!gh.calls.some(call => call.path.endsWith('/git/blobs')))
})

// Production 2026-10-21: the created repository answered 404 one request after its creation (fixed by #4747; this
// regression test was dropped by #4749 and is restored here).
test('a just-created repository that is not readable yet is waited for; the shared one never is', async () => {
  const gh = freshGitHub({ lookupPendingFor: 2 })
  const result = await publishFresh(gh.request)
  assert.equal(result.repository, `SignalBoost/${gh.name}`)
  assert.equal(gh.calls.filter(call => call.path === `/repos/SignalBoost/${gh.name}`).length, 3)
  const shared = github({ repository: Response.json({ message: 'Not Found' }, { status: 404 }) })
  await assert.rejects(publish('SignalBoost', shared.request), /^Error: builder_isolated_repository_unavailable$/)
  assert.equal(shared.calls.length, 1)
})

test('the first commit of a just-created repository is waited for, briefly', async () => {
  const gh = freshGitHub({ refPendingFor: 2 })
  const result = await publishFresh(gh.request)
  assert.equal(result.commitSha, sha('e'))
  assert.equal(gh.calls.filter(call => call.path.endsWith('/git/ref/heads/main')).length, 3)
  // The shared repository is never waited for: an empty one is a configuration error.
  await assert.rejects(publish('SignalBoost', github({ defaultRef: Response.json({}, { status: 409 }) }).request), /builder_isolated_repository_empty/)
})

test('verified API response is retained in the durable publication receipt', async () => {
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ id: 'dpl_valid123' })
    if (String(url).endsWith('/v13/deployments/dpl_valid123'))
      return Response.json({ readyState: 'READY', url: 'example.vercel.app' })
    return Response.json({ total: 5 }, { status: 200 })
  }) as typeof fetch
  const result = await verifyIsolatedPreview({
    token: 'test', projectId: 'prj_abc123', repository: 'SignalBoost/builder-isolated',
    commitSha: 'a'.repeat(40), files,
    objective: 'GET /sum?a=2&b=3\nExpected response:\n```json\n{"total":5}\n```',
    deadlineAt: Date.now() + 60_000, request,
  })
  assert.equal(result.endpointUrl, 'https://example.vercel.app/sum?a=2&b=3')
  assert.equal(result.httpStatus, 200)
  assert.deepEqual(result.responseBody, { total: 5 })
})

// A GitHub holding one draft PR #3 whose head is the verified commit.
function mergeable(options: { head?: string; base?: string; ready?: unknown; merge?: Response; merged?: boolean } = {}) {
  const calls: { path: string; method: string; body: any }[] = []
  let draft = true
  let merged = false
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method || 'GET'
    const path = new URL(String(url)).pathname
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path === '/repos/SignalBoost/builder-isolated') return Response.json({ full_name: 'SignalBoost/builder-isolated', private: true, default_branch: 'main' })
    if (path === '/repos/SignalBoost/builder-isolated/pulls/3' && method === 'GET') {
      return Response.json({ node_id: 'PR_node3', draft, head: { sha: options.head ?? sha('e') }, base: { ref: options.base ?? 'main' },
        merged: options.merged ?? merged, merge_commit_sha: (options.merged ?? merged) ? sha('f') : null })
    }
    if (path === '/graphql') {
      assert.equal(body.variables.id, 'PR_node3')
      draft = false
      return Response.json(options.ready ?? { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } })
    }
    if (path === '/repos/SignalBoost/builder-isolated/pulls/3/merge' && method === 'PUT') {
      if (draft) return Response.json({ message: 'Pull Request is still a draft' }, { status: 405 })
      if (options.merge) return options.merge
      merged = true
      return Response.json({ merged: true, sha: sha('f') })
    }
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }) as typeof fetch
  return { calls, request }
}
const merge = (request: typeof fetch, overrides: Partial<{ previewVerified: boolean; commitSha: string }> = {}) => mergeVerifiedIsolatedPullRequest({
  token: 'test', repository: 'SignalBoost/builder-isolated', pullRequestNumber: 3, commitSha: sha('e'), previewVerified: true, request, ...overrides,
})

test('after a verified preview the draft PR is marked ready, merged at the verified commit and confirmed', async () => {
  const gh = mergeable()
  assert.deepEqual(await merge(gh.request), { mergedInto: 'main', mergeCommitSha: sha('f') })
  const put = gh.calls.find(call => call.method === 'PUT')!
  assert.equal(put.body.sha, sha('e'), 'pinned to the tested and previewed commit')
  assert.equal(put.body.merge_method, 'merge')
  assert.ok(gh.calls.findIndex(call => call.path === '/graphql') < gh.calls.indexOf(put), 'ready before merge')
  assert.equal(gh.calls.at(-1)!.method, 'GET', 'the merge is confirmed by reading the PR back')
})

test('nothing is merged without a verified preview, a matching head and the default branch as base', async () => {
  for (const [label, gh, overrides, error] of [
    ['unverified preview', mergeable(), { previewVerified: false }, /merge_requires_verified_preview/],
    ['head moved after verification', mergeable({ head: sha('9') }), {}, /merge_head_changed/],
    ['PR aimed elsewhere', mergeable({ base: 'builder/x/base' }), {}, /merge_base_invalid/],
    ['ready refused', mergeable({ ready: { errors: [{ message: 'no' }] } }), {}, /mark_ready_refused/],
  ] as const) {
    await assert.rejects(merge(gh.request, overrides), error, label)
    assert.ok(!gh.calls.some(call => call.method === 'PUT'), `${label}: no merge attempted`)
  }
})

test('a refused or unconfirmed merge fails the job instead of being reported as merged', async () => {
  await assert.rejects(merge(mergeable({ merge: Response.json({ message: 'conflict' }, { status: 409 }) }).request), /^Error: builder_isolated_github_merge_http_409$/)
  const silent = mergeable({ merge: Response.json({ merged: true }), merged: false })
  await assert.rejects(merge(silent.request), /merge_unconfirmed/)
})

test('the owner job succeeds only once the merge is confirmed', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  // Publication runs in one shared function for Handle it for me and for Work with me after "go".
  const publish = runner.slice(runner.indexOf('async function publishIsolatedJobFilesUntraced('), runner.indexOf('async function runApprovedIsolatedPublication('))
  assert.match(publish, /if \(!job\.ownerAuthorized\) throw new Error\('builder_isolated_publication_not_authorized'\)/)
  assert.ok(publish.indexOf('verifyIsolatedPreview(') < publish.indexOf('mergeVerifiedIsolatedPullRequest('), 'merge only after the preview')
  assert.match(publish, /previewVerified: preview\.status === 'verified'/)
  const laneStart = runner.indexOf('if (verified && acceptance.passed && requiresPublication)')
  const lane = runner.slice(laneStart, runner.indexOf('const success = finalProof.passed', laneStart) + 40)
  assert.match(lane, /await publishIsolatedJobFiles\(\{/)
  assert.match(lane, /const finalProof = builderFinalProof\(/)
  assert.match(lane, /const success = finalProof\.passed/)
})
