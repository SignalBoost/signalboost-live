import assert from 'node:assert/strict'
import test from 'node:test'
import { publishVerifiedIsolatedProject, validateIsolatedFiles } from '../lib/builder/isolated-publication.ts'

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
