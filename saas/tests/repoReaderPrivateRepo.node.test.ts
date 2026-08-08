import test from 'node:test'
import assert from 'node:assert/strict'
import { readRepoFile } from '../lib/ai/tools/repoReader.ts'

test('readRepoFile uses authenticated GitHub Contents API for private repo files', async () => {
  const originalFetch = global.fetch
  const originalReadToken = process.env.GITHUB_TOKEN
  const originalWriteToken = process.env.GITHUB_WRITE_TOKEN

  process.env.GITHUB_TOKEN = 'test-read-token'
  delete process.env.GITHUB_WRITE_TOKEN

  let requestedUrl = ''
  let authorization = ''

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input)
    const headers = new Headers(init?.headers)
    authorization = headers.get('authorization') || ''
    return new Response(JSON.stringify({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from('private repo content', 'utf8').toString('base64'),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const result = await readRepoFile('saas/app/api/example/route.ts')
    assert.equal(result.ok, true)
    assert.equal(result.content, 'private repo content')
    assert.equal(result.truncated, false)
    assert.match(requestedUrl, /^https:\/\/api\.github\.com\/repos\/SignalBoost\/signalboost-live\/contents\//)
    assert.equal(requestedUrl.includes('raw.githubusercontent.com'), false)
    assert.equal(authorization, 'Bearer test-read-token')
  } finally {
    global.fetch = originalFetch
    if (originalReadToken === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = originalReadToken
    if (originalWriteToken === undefined) delete process.env.GITHUB_WRITE_TOKEN
    else process.env.GITHUB_WRITE_TOKEN = originalWriteToken
  }
})

test('readRepoFile falls back to GITHUB_WRITE_TOKEN for authenticated GET access', async () => {
  const originalFetch = global.fetch
  const originalReadToken = process.env.GITHUB_TOKEN
  const originalWriteToken = process.env.GITHUB_WRITE_TOKEN

  delete process.env.GITHUB_TOKEN
  process.env.GITHUB_WRITE_TOKEN = 'test-write-token'

  let authorization = ''
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('authorization') || ''
    return new Response(JSON.stringify({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from('ok', 'utf8').toString('base64'),
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const result = await readRepoFile('README.md')
    assert.equal(result.ok, true)
    assert.equal(authorization, 'Bearer test-write-token')
  } finally {
    global.fetch = originalFetch
    if (originalReadToken === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = originalReadToken
    if (originalWriteToken === undefined) delete process.env.GITHUB_WRITE_TOKEN
    else process.env.GITHUB_WRITE_TOKEN = originalWriteToken
  }
})
