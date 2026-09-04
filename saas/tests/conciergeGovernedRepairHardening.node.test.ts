import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pastedConciergeSourceFile } from '../lib/ai/cos/agentProgressClient.ts'
import { publishSignalBoostRepositoryRepair } from '../lib/builder/repository-repair-writeback.ts'
import type { SignalBoostRepositoryRepairTarget } from '../lib/builder/repository-repair-target.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function target(baseSha: string): SignalBoostRepositoryRepairTarget {
  return Object.freeze({
    trigger: 'failed_build_log',
    repository: 'SignalBoost/signalboost-live',
    repositoryUrl: 'https://github.com/SignalBoost/signalboost-live.git',
    branch: 'main',
    commitSha: baseSha,
    fullCommitSha: baseSha,
    projectRoot: 'saas',
    pathHints: Object.freeze(['saas/scripts/fix.sh']),
    symbolHints: Object.freeze([]),
    failedCommand: 'bash scripts/fix.sh',
    failureEvidence: Object.freeze(['exit 1']),
    rawLog: 'failed build log',
  })
}

test('browser surface marker keeps homepage Concierge public even for an owner account', () => {
  const client = read('../lib/ai/cos/agentProgressClient.ts')
  const browser = read('../app/api/cos-browser/route.ts')

  assert.match(client, /'x-signalboost-surface': args\.target/)
  assert.match(browser, /req\.headers\.get\('x-signalboost-surface'\) === 'cos'/)
  assert.match(browser, /surface: 'concierge'/)
  assert.match(browser, /allowRepositoryRepair: false/)
  assert.match(browser, /surface: 'assistant'/)
  assert.match(browser, /allowRepositoryRepair: true/)
  assert.match(browser, /access\?\.isOwner && browserSurface === 'assistant'/)
})

test('explicitly labelled supported fenced source is staged across advertised non-JS languages', () => {
  const cases = [
    ['html', '<main>hello</main>', 'html'],
    ['css', 'body { color: red; }', 'css'],
    ['json', '{"ok":true}', 'json'],
    ['sql', 'select 1;', 'sql'],
    ['bash', 'echo hello', 'sh'],
  ] as const

  for (const [language, source, extension] of cases) {
    const staged = pastedConciergeSourceFile(`Please fix this code:\n\`\`\`${language}\n${source}\n\`\`\``)
    assert.ok(staged, `${language} should be staged`)
    assert.equal(staged.path, `pasted-source.${extension}`)
    assert.equal(staged.content, source)
  }
})

test('repository repair preserves tracked executable mode for existing scripts', async () => {
  const baseSha = 'a'.repeat(40)
  const baseTreeSha = 'b'.repeat(40)
  const scriptBlobSha = 'c'.repeat(40)
  const tokenBlobSha = 'd'.repeat(40)
  const createdTreeSha = 'e'.repeat(40)
  const createdCommitSha = 'f'.repeat(40)
  let blobIndex = 0
  let createdTreeBody = ''

  const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = String(init.method || 'GET')
    if (url.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: baseSha } })
    if (url.endsWith(`/git/commits/${baseSha}`)) return jsonResponse({ tree: { sha: baseTreeSha } })
    if (url.includes(`/git/trees/${baseTreeSha}?recursive=1`)) {
      return jsonResponse({ tree: [{ path: 'saas/scripts/fix.sh', mode: '100755', type: 'blob', sha: '1'.repeat(40) }] })
    }
    if (url.endsWith('/git/blobs') && method === 'POST') {
      return jsonResponse({ sha: blobIndex++ === 0 ? scriptBlobSha : tokenBlobSha }, 201)
    }
    if (url.endsWith('/git/trees') && method === 'POST') {
      createdTreeBody = typeof init.body === 'string' ? init.body : ''
      return jsonResponse({ sha: createdTreeSha }, 201)
    }
    if (url.endsWith('/git/commits') && method === 'POST') return jsonResponse({ sha: createdCommitSha }, 201)
    if (url.endsWith('/git/refs') && method === 'POST') return jsonResponse({ ref: 'refs/heads/cos/platform-repair' }, 201)
    if (url.endsWith('/pulls') && method === 'POST') {
      return jsonResponse({ number: 1842, html_url: 'https://github.com/SignalBoost/signalboost-live/pull/1842' }, 201)
    }
    return jsonResponse({ message: `unexpected ${method} ${url}` }, 500)
  }) as typeof fetch

  const outcome = await publishSignalBoostRepositoryRepair({
    target: target(baseSha),
    workspaceId: '11111111-1111-4111-8111-111111111111',
    files: [{ path: 'scripts/fix.sh', content: '#!/bin/sh\necho fixed\n', updatedAt: 0 }],
    patch: 'diff --git a/saas/scripts/fix.sh b/saas/scripts/fix.sh',
    request,
    token: 'server-write-token',
  })

  assert.equal(outcome.repositoryWriteTaken, true)
  const payload = JSON.parse(createdTreeBody)
  const script = payload.tree.find((entry: any) => entry.path === 'saas/scripts/fix.sh')
  assert.equal(script.mode, '100755')
})
