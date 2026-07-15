import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DefaultBrowserSessionFactory,
  type BrowserEngineBrowser,
  type BrowserEngineContext,
  type BrowserEngineLauncher,
  type BrowserEnginePage,
} from '../lib/browser-runtime/session-factory'
import type { BrowserTask } from '../lib/browser-runtime/contracts'

const task: BrowserTask = {
  taskId: 'task-1',
  incidentId: 'incident-1',
  provider: 'sandbox',
  adapterId: 'sandbox.v1',
  mode: 'observe',
  issuedAt: '2026-07-15T00:00:00.000Z',
  expiresAt: '2026-07-16T00:00:00.000Z',
  allowedOrigins: ['https://sandbox.example'],
  steps: [],
  approvalToken: 'test-token',
}

function fixture(options: { failContext?: boolean; delayLaunchMs?: number } = {}) {
  const calls: string[] = []
  let currentUrl = 'about:blank'

  const page: BrowserEnginePage = {
    url: () => currentUrl,
    goto: async url => { calls.push(`goto:${url}`); currentUrl = url },
    click: async selector => { calls.push(`click:${selector}`) },
    fill: async (selector, value) => { calls.push(`fill:${selector}:${value}`) },
    waitForSelector: async selector => { calls.push(`wait:${selector}`) },
  }

  const context: BrowserEngineContext = {
    newPage: async () => { calls.push('newPage'); return page },
    close: async () => { calls.push('context.close') },
  }

  const browser: BrowserEngineBrowser = {
    newContext: async config => {
      calls.push(`newContext:${config.serviceWorkers}:${config.acceptDownloads}`)
      if (options.failContext) throw new Error('context failed')
      return context
    },
    close: async () => { calls.push('browser.close') },
  }

  const launcher: BrowserEngineLauncher = {
    launch: async config => {
      calls.push(`launch:${config.headless}`)
      if (options.delayLaunchMs) await new Promise(resolve => setTimeout(resolve, options.delayLaunchMs))
      return browser
    },
  }

  return { calls, launcher }
}

test('opens an isolated session, delegates page actions, and closes once', async () => {
  const { calls, launcher } = fixture()
  const factory = new DefaultBrowserSessionFactory({ launcher })
  const session = await factory.open(task)

  await session.page.goto('https://sandbox.example/dashboard')
  await session.page.click('#settings')
  await session.page.fill('#name', 'SignalBoost')
  await session.page.waitForSelector('#saved')
  await session.close()
  await session.close()

  assert.deepEqual(calls, [
    'launch:true',
    'newContext:block:false',
    'newPage',
    'goto:https://sandbox.example/dashboard',
    'click:#settings',
    'fill:#name:SignalBoost',
    'wait:#saved',
    'context.close',
    'browser.close',
  ])
})

test('closes the browser when context creation fails', async () => {
  const { calls, launcher } = fixture({ failContext: true })
  const factory = new DefaultBrowserSessionFactory({ launcher })

  await assert.rejects(() => factory.open(task), /context failed/)
  assert.equal(calls.at(-1), 'browser.close')
})

test('fails closed when browser launch exceeds its deadline', async () => {
  const { launcher } = fixture({ delayLaunchMs: 30 })
  const factory = new DefaultBrowserSessionFactory({ launcher, launchTimeoutMs: 5 })

  await assert.rejects(() => factory.open(task), /Browser launch timed out/)
})
