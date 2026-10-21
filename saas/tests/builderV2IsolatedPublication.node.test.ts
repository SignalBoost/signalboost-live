import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { publishVerifiedIsolatedProject, validateIsolatedFiles, verifyIsolatedPreview, wantsIsolatedPublication } from '../lib/builder/isolated-publication.ts'

const files = [{ path: 'src/add.js', content: 'module.exports = (a,b) => a+b', updatedAt: Date.now() }]
test('isolated publisher rejects unverified work and unsafe paths before network calls', async () => {
  let calls = 0
  const request = (async () => { calls++; throw new Error('network forbidden') }) as typeof fetch
  const base = { owner: 'SignalBoost', repositoryName: 'builder-isolated-test', token: 'test', files, request }
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
    if (path === '/users/SignalBoost') result = { login: 'SignalBoost', type: 'Organization' }
    else if (path === '/orgs/SignalBoost/repos') result = { full_name: 'SignalBoost/builder-isolated-test', private: true, default_branch: 'main' }
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
    owner: 'SignalBoost', repositoryName: 'builder-isolated-test', token: 'test',
    files, verified: true, authorized: true, request,
  })
  assert.equal(result.pullRequestNumber, 3)
  assert.equal(result.commitSha, sha('e'))
  assert.equal(calls[0].url, 'https://api.github.com/users/SignalBoost', 'account type is read before creating')
  assert.equal(calls.find(x => x.url.endsWith('/orgs/SignalBoost/repos'))?.body.private, true)
  assert.equal(calls.at(-1)?.body.draft, true)
  assert.equal(calls.at(-1)?.body.base, 'isolated-test')
  assert.ok(calls.some(x => x.url.endsWith('/git/refs') && x.body.ref === 'refs/heads/isolated-test'))
  assert.ok(calls.some(x => x.url.endsWith('/git/refs') && x.body.ref === 'refs/heads/builder/verified-repair'))
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

test('new repository default ref 404 is retried without repeating repository creation', async () => {
  let creates = 0
  let refReads = 0
  const sha = (v: string) => v.repeat(40)
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/users/SignalBoost') return Response.json({ login: 'SignalBoost', type: 'Organization' })
    if (path === '/orgs/SignalBoost/repos') { creates++; return Response.json({ full_name: 'SignalBoost/builder-isolated-test', private: true, default_branch: 'main' }) }
    if (path.endsWith('/git/ref/heads/main')) {
      refReads++
      return refReads === 1 ? Response.json({ message: 'Not Found' }, { status: 404 }) : Response.json({ object: { sha: sha('a') } })
    }
    if (path.endsWith('/git/commits/' + sha('a'))) return Response.json({ tree: { sha: sha('b') } })
    if (path.endsWith('/git/blobs')) return Response.json({ sha: sha('c') })
    if (path.endsWith('/git/trees')) return Response.json({ sha: sha('d') })
    if (path.endsWith('/git/commits')) return Response.json({ sha: sha('e') })
    if (path.endsWith('/pulls')) return Response.json({ number: 1, html_url: 'https://github.com/SignalBoost/builder-isolated-test/pull/1' })
    return Response.json({})
  }) as typeof fetch
  await publishVerifiedIsolatedProject({ owner: 'SignalBoost', repositoryName: 'builder-isolated-test',
    token: 'test', files, verified: true, authorized: true, request })
  assert.equal(creates, 1)
  assert.equal(refReads, 2)
})

test('an unknown owner is reported at owner lookup, before anything is created', async () => {
  const request = (async () => Response.json({ message: 'Not Found' }, { status: 404 })) as typeof fetch
  await assert.rejects(publishVerifiedIsolatedProject({ owner: 'SignalBoost', repositoryName: 'builder-isolated-test',
    token: 'test', files, verified: true, authorized: true, request }), /builder_isolated_github_owner_lookup_http_404/)
})

// Production 2026-10-21: SignalBoost is a personal account; a hand-set organization type sent creation to
// /orgs/SignalBoost/repos, which GitHub answers with 404. The type now comes from GitHub itself.
function personalAccount(viewer: string, onCreate: (path: string) => Response) {
  const paths: string[] = []
  const request = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname
    paths.push(path)
    if (path.toLowerCase() === '/users/signalboost') return Response.json({ login: 'SignalBoost', type: 'User' })
    if (path === '/user') return Response.json({ login: viewer })
    if (path === '/user/repos' || path.startsWith('/orgs/')) return onCreate(path)
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'a'.repeat(40) } })
    if (path.endsWith('/git/commits/' + 'a'.repeat(40))) return Response.json({ tree: { sha: 'b'.repeat(40) } })
    if (path.endsWith('/git/blobs')) return Response.json({ sha: 'c'.repeat(40) })
    if (path.endsWith('/git/trees')) return Response.json({ sha: 'd'.repeat(40) })
    if (path.endsWith('/git/commits')) return Response.json({ sha: 'e'.repeat(40) })
    if (path.endsWith('/pulls')) return Response.json({ number: 7, html_url: 'https://github.com/SignalBoost/builder-isolated-test/pull/7' })
    return Response.json({})
  }) as typeof fetch
  return { paths, request }
}

test('a personal account is published through /user/repos, never the organization endpoint', async () => {
  const github = personalAccount('signalboost', () => Response.json({ full_name: 'SignalBoost/builder-isolated-test', private: true, default_branch: 'main' }))
  const result = await publishVerifiedIsolatedProject({ owner: 'signalboost', repositoryName: 'builder-isolated-test',
    token: 'test', files, verified: true, authorized: true, request: github.request })
  assert.equal(result.repository, 'SignalBoost/builder-isolated-test')
  assert.equal(result.pullRequestNumber, 7)
  assert.ok(github.paths.includes('/user/repos'))
  assert.ok(!github.paths.some(path => path.startsWith('/orgs/')))
  assert.ok(github.paths.includes('/repos/SignalBoost/builder-isolated-test/git/refs'), 'canonical owner name from GitHub')
})

test('a token from another account is refused before any repository is created', async () => {
  let created = 0
  const github = personalAccount('someone-else', () => { created++; return Response.json({}) })
  await assert.rejects(publishVerifiedIsolatedProject({ owner: 'SignalBoost', repositoryName: 'builder-isolated-test',
    token: 'test', files, verified: true, authorized: true, request: github.request }), /builder_isolated_token_account_mismatch/)
  assert.equal(created, 0)
})

test('creation HTTP 404 is identified as a create-repository failure', async () => {
  const github = personalAccount('SignalBoost', () => Response.json({ message: 'Not Found' }, { status: 404 }))
  await assert.rejects(publishVerifiedIsolatedProject({ owner: 'SignalBoost', repositoryName: 'builder-isolated-test',
    token: 'test', files, verified: true, authorized: true, request: github.request }), /builder_isolated_github_create_repository_http_404/)
})

test('no hand-set owner type remains in the publication path', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(runner, /BUILDER_ISOLATED_GITHUB_OWNER_TYPE/)
  assert.doesNotMatch(runner, /ownerType/)
})
