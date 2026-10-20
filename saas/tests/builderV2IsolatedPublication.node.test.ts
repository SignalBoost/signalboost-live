import assert from 'node:assert/strict'
import test from 'node:test'
import { publishVerifiedIsolatedProject, validateIsolatedFiles, verifyIsolatedPreview, wantsIsolatedPublication } from '../lib/builder/isolated-publication.ts'

const files = [{ path: 'src/add.js', content: 'module.exports = (a,b) => a+b', updatedAt: Date.now() }]
test('isolated publisher rejects unverified work and unsafe paths before network calls', async () => {
  let calls = 0
  const request = (async () => { calls++; throw new Error('network forbidden') }) as typeof fetch
  const base = { owner: 'SignalBoost', ownerType: 'organization' as const, repositoryName: 'builder-isolated-test', token: 'test', files, request }
  await assert.rejects(publishVerifiedIsolatedProject({ ...base, verified: false, authorized: true }), /not_authorized/)
  await assert.rejects(publishVerifiedIsolatedProject({ ...base, verified: true, authorized: false }), /not_authorized/)
  assert.throws(() => validateIsolatedFiles([{ ...files[0], path: '../secret' }]), /path_rejected/)
  assert.throws(() => validateIsolatedFiles([{ ...files[0], path: '.env.local' }]), /path_rejected/)
  assert.equal(calls, 0)
})

test('verified private organization repository is published as a draft PR using exact git commit', async () => {
  const calls: { url: string; method: string; body: any }[] = []
  const sha = (symbol: string) => symbol.repeat(40)
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method || 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url: String(url), method, body })
    const path = new URL(String(url)).pathname
    let result: any
    if (path === '/orgs/SignalBoost/repos') result = { full_name: 'SignalBoost/builder-isolated-test', private: true, default_branch: 'main' }
    else if (path.endsWith('/git/ref/heads/main')) result = { object: { sha: sha('a') } }
    else if (path.endsWith('/git/commits/' + sha('a'))) result = { tree: { sha: sha('b') } }
    else if (path.endsWith('/git/blobs')) result = { sha: sha('c') }
    else if (path.endsWith('/git/trees')) result = { sha: sha('d') }
    else if (path.endsWith('/git/commits')) result = { sha: sha('e') }
    else if (path.endsWith('/pulls')) result = { number: 3, html_url: 'https://github.com/SignalBoost/builder-isolated-test/pull/3' }
    else result = {}
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  const result = await publishVerifiedIsolatedProject({
    owner: 'SignalBoost', ownerType: 'organization', repositoryName: 'builder-isolated-test', token: 'test',
    files, verified: true, authorized: true, request,
  })
  assert.equal(result.pullRequestNumber, 3)
  assert.equal(result.commitSha, sha('e'))
  assert.equal(calls[0].body.private, true)
  assert.equal(calls.at(-1)?.body.draft, true)
  assert.equal(calls.at(-1)?.body.base, 'main')
  assert.ok(calls.some(x => x.url.endsWith('/git/refs') && x.body.ref === 'refs/heads/builder/verified-repair'))
})

test('preview uses exact verified GitHub SHA and checks live endpoint', async () => {
  const sha = 'a'.repeat(40)
  const calls: string[] = []
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    if (String(url).endsWith('/v13/deployments') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.gitSource.ref, sha)
      assert.equal(body.gitSource.repo, 'SignalBoost/builder-isolated-test')
      assert.equal(body.target, 'preview')
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
    commitSha: sha, deadlineAt: Date.now() + 60_000, request,
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
    commitSha: 'a'.repeat(40), deadlineAt: Date.now() - 1,
    request: (async () => { called = true; throw new Error('unexpected') }) as typeof fetch,
  }), /deadline_exceeded/)
  assert.equal(called, false)
})
