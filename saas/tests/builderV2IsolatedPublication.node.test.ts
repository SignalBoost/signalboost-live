// saas/tests/builderV2IsolatedPublication.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ISOLATED_REPOSITORY_NAME, publishVerifiedIsolatedProject, validateIsolatedFiles, verifyIsolatedPreview, isolatedDeploymentFiles, isolatedPreviewProbe, wantsIsolatedPublication } from '../lib/builder/isolated-publication.ts'

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
test('a verified job is published into the fixed private repository as a draft PR between its own branches', async () => {
  const gh = github()
  const result = await publish('SignalBoost', gh.request)
  assert.equal(ISOLATED_REPOSITORY_NAME, 'builder-isolated')
  assert.equal(result.repository, 'SignalBoost/builder-isolated')
  assert.equal(result.pullRequestNumber, 3)
  assert.equal(result.commitSha, sha('e'))
  assert.equal(gh.calls[0].path, '/repos/SignalBoost/builder-isolated', 'the repository is looked up first')
  assert.ok(!gh.calls.some(call => call.path === '/user/repos' || call.path.startsWith('/orgs/')), 'no repository is ever created')
  const refs = gh.calls.filter(call => call.path.endsWith('/git/refs')).map(call => call.body)
  assert.deepEqual(refs, [
    { ref: `refs/heads/builder/${jobKey}/base`, sha: sha('a') },
    { ref: `refs/heads/builder/${jobKey}/verified`, sha: sha('e') },
  ])
  const pr = gh.calls.at(-1)!
  assert.equal(pr.body.draft, true)
  assert.equal(pr.body.base, `builder/${jobKey}/base`, 'never the default branch')
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
  await assert.rejects(publish('SignalBoost', request), /builder_isolated_github_create_base_branch_http_403/)
})

test('the job id names the branches and no per-job repository remains', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /owner, jobKey: job\.id,/)
  assert.doesNotMatch(runner, /repositoryName/)
  const publisher = readFileSync(new URL('../lib/builder/isolated-publication.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(publisher, /\/user\/repos|\/orgs\/|create_repository|BUILDER_ISOLATED_GITHUB_OWNER_TYPE/)
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

test('explicit fresh private repo request creates a private org repository before publishing', async () => {
  const calls: { path: string; method: string; body: any }[] = []
  const name = `builder-${jobKey}`
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    const method = init?.method || 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method, body })
    if (path === '/orgs/SignalBoost/repos' && method === 'POST')
      return Response.json({ full_name: `SignalBoost/${name}`, private: true }, { status: 201 })
    if (path === `/repos/SignalBoost/${name}`)
      return Response.json({ full_name: `SignalBoost/${name}`, private: true, default_branch: 'main' })
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: sha('a') } })
    if (path.endsWith('/git/commits/' + sha('a'))) return Response.json({ tree: { sha: sha('b') } })
    if (path.endsWith('/git/blobs')) return Response.json({ sha: sha('c') })
    if (path.endsWith('/git/trees')) return Response.json({ sha: sha('d') })
    if (path.endsWith('/git/commits')) return Response.json({ sha: sha('e') })
    if (path.endsWith('/git/refs')) return Response.json({ ref: 'ok' }, { status: 201 })
    if (path.endsWith('/pulls')) return Response.json({ number: 1, html_url: `https://github.com/SignalBoost/${name}/pull/1` })
    return Response.json({ error: 'unexpected' }, { status: 404 })
  }) as typeof fetch
  const result = await publishVerifiedIsolatedProject({
    owner: 'SignalBoost', jobKey, token: 'test', files,
    verified: true, authorized: true, newRepository: true, request,
  })
  assert.equal(result.repository, `SignalBoost/${name}`)
  assert.equal(calls[0].path, '/orgs/SignalBoost/repos')
  assert.equal(calls[0].body.private, true)
  assert.equal(calls[0].body.auto_init, true)
  assert.equal(calls.at(-1)?.body.base, `builder/${jobKey}/base`)
})

test('private repository creation denied with 403 fails closed without shared fallback', async () => {
  const calls: string[] = []
  const request = (async (url: string | URL | Request) => {
    calls.push(new URL(String(url)).pathname)
    return Response.json({ message: 'Forbidden' }, { status: 403 })
  }) as typeof fetch
  await assert.rejects(publishVerifiedIsolatedProject({
    owner: 'SignalBoost', jobKey, token: 'test', files,
    verified: true, authorized: true, newRepository: true, request,
  }), /builder_isolated_github_create_repository_http_403/)
  assert.deepEqual(calls, ['/orgs/SignalBoost/repos'])
})
