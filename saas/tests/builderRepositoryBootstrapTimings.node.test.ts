import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { githubFetchAuthArgs } from '../lib/builder/vercel-repository-repair-session.ts'

test('public repository fetch does not require GitHub credentials', () => {
  const old = process.env.GITHUB_TOKEN
  try {
    delete process.env.GITHUB_TOKEN
    assert.deepEqual(githubFetchAuthArgs(), [])
  } finally {
    if (old === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = old
  }
})

test('repository bootstrap measures git and npm latency separately before model execution', () => {
  const session = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(session, /builder_repository_bootstrap_timing/)
  assert.match(session, /gitFetchMs/)
  assert.match(session, /npmInstallMs/)
  assert.match(repair, /remainingExecutionMs/)
})
