import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionFactory, BrowserSessionLaunchRequest, BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import { migrateBrowserSession } from '../lib/browser-runtime/session-migration.ts'

const launchRequest: BrowserSessionLaunchRequest = {
  provider: 'target',
  adapterId: 'target',
  mode: 'observe',
  allowedOrigins: ['https://example.com'],
}

function createSession(url: string) {
  const events: string[] = []
  const session: BrowserSessionPort = {
    page: {
      url: () => url,
      goto: async value => { events.push(`goto:${value}`) },
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    close: async () => { events.push('close') },
  }
  return { session, events }
}

test('migrates a URL-only session and optionally closes the source', async () => {
  const source = createSession('https://example.com/account')
  const target = createSession('about:blank')
  const factory: BrowserSessionFactory = { open: async () => target.session }

  const result = await migrateBrowserSession({
    migrationId: 'migration-001',
    createdAt: '2026-07-24T19:00:00.000Z',
    sourceSession: source.session,
    targetFactory: factory,
    targetLaunchRequest: launchRequest,
    allowedOrigins: ['https://example.com'],
    includeProfile: false,
    closeSourceOnSuccess: true,
  })

  assert.equal(result.targetSession, target.session)
  assert.equal(result.sourceClosed, true)
  assert.deepEqual(target.events, ['goto:https://example.com/account'])
  assert.deepEqual(source.events, ['close'])
})

test('closes the target and leaves the source open when restore fails', async () => {
  const source = createSession('https://other.example/account')
  const target = createSession('about:blank')

  await assert.rejects(() => migrateBrowserSession({
    migrationId: 'migration-002',
    createdAt: '2026-07-24T19:01:00.000Z',
    sourceSession: source.session,
    targetFactory: { open: async () => target.session },
    targetLaunchRequest: launchRequest,
    allowedOrigins: ['https://example.com'],
    includeProfile: false,
    closeSourceOnSuccess: true,
  }), /origin_rejected/)

  assert.deepEqual(target.events, ['close'])
  assert.deepEqual(source.events, [])
})
