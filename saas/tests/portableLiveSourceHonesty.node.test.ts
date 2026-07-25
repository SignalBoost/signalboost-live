// saas/tests/portableLiveSourceHonesty.node.test.ts
//
// The rule this suite protects: a portable may not LOOK connected because someone created a
// table for it.
//
// Two portables were reported on the homepage as "Connected · idle" — a table existed, a
// Supabase adapter existed, the row count read zero. That badge reads as *wired up, just
// quiet*. It was not: nothing called either adapter, so the count could never move. These
// tests make that failure mode loud instead of flattering.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  NO_LIVE_SOURCE_REASONS,
  PORTABLE_ACTIVITY_SOURCES,
  loadAllPortableActivity,
  loadPortableActivity,
  portablesWithUnexplainedSilence,
  portablesWithoutLiveSource,
} from '../lib/portable-products/live-activity.ts'
import type { PortableActivityStore } from '../lib/portable-products/live-activity.ts'

/** A store where every table is reachable and empty — the flattering case. */
const emptyStore: PortableActivityStore = {
  async readTableActivity() {
    return { rowCount: 0, lastActivityAt: null }
  },
}

const busyStore: PortableActivityStore = {
  async readTableActivity() {
    return { rowCount: 12, lastActivityAt: '2026-07-25T10:00:00.000Z' }
  },
}

test('a portable with no source reports no_live_source, never idle', async () => {
  const activity = await loadPortableActivity('browser-agent-ecosystem', emptyStore)
  assert.equal(activity.status, 'no_live_source')
  assert.notEqual(activity.status, 'idle')
  assert.equal(activity.totalRows, 0)
})

test('the summary says WHY there is no signal, not just that there is none', async () => {
  const browser = await loadPortableActivity('browser-agent-ecosystem', emptyStore)
  assert.match(browser.summary, /nothing anywhere calls the adapter/i)
  assert.match(browser.summary, /Chromium cannot run in a serverless function/i)

  const agentOps = await loadPortableActivity('agent-operations-platform', emptyStore)
  assert.match(agentOps.summary, /needs a caller, not more machinery/i)
})

test('idle is reserved for a portable something actually writes to', async () => {
  const pressMedia = await loadPortableActivity('press-media', emptyStore)
  assert.equal(pressMedia.status, 'idle')
  assert.match(pressMedia.summary, /never done anything in this environment/i)
})

test('a portable with rows is active and reports them', async () => {
  const activity = await loadPortableActivity('campaign-studio', busyStore)
  assert.equal(activity.status, 'active')
  assert.equal(activity.totalRows, 36)
})

test('EVERY portable without a source has a stated reason', () => {
  const allIds = [
    'agent-operations-platform',
    'browser-agent-ecosystem',
    'campaign-studio',
    'control-center',
    'integrations-hub',
    'marketing-sales',
    'portable-ai-chief-of-staff',
    'press-media',
    'provider-hub',
    'self-healing-supervisor',
    'video-maker',
  ]
  assert.deepEqual(portablesWithUnexplainedSilence(allIds), [])

  for (const id of portablesWithoutLiveSource(allIds)) {
    assert.ok(NO_LIVE_SOURCE_REASONS[id], `${id} has no source and no stated reason`)
    assert.ok(NO_LIVE_SOURCE_REASONS[id].length > 40, `${id} reason is too thin to be useful`)
  }
})

test('an unreadable table makes a portable unknown, never healthy', async () => {
  const brokenStore: PortableActivityStore = {
    async readTableActivity(table: string) {
      if (table === 'cos_events') throw new Error('permission denied')
      return { rowCount: 5, lastActivityAt: '2026-07-25T10:00:00.000Z' }
    },
  }
  const activity = await loadPortableActivity('campaign-studio', brokenStore)
  assert.equal(activity.status, 'unreachable')
  assert.match(activity.summary, /unknown, not healthy/i)
})

test('the reasons name what has to be built, so the card is also the backlog', () => {
  assert.match(NO_LIVE_SOURCE_REASONS['browser-agent-ecosystem'], /browser host/i)
  assert.match(NO_LIVE_SOURCE_REASONS['agent-operations-platform'], /lib\/agent-runtime/)
})

test('loadAllPortableActivity preserves the order it was given', async () => {
  const ids = ['press-media', 'browser-agent-ecosystem', 'campaign-studio']
  const activity = await loadAllPortableActivity(ids, emptyStore)
  assert.deepEqual(activity.map((a) => a.productId), ids)
})
