// saas/tests/supervisorApprovalLink.node.test.ts
//
// The approval link in a paused-step email.
//
// This exists because the link was broken in production and only a human opening the
// email found it. The console base fell back to NEXT_PUBLIC_APP_URL — which is the
// SITE root, used everywhere else in the app — while the code assumed it already
// ended in /dashboard. So every approver was sent to a 404.
//
// That is the worst possible failure for this particular control. The entire value of
// the Self-Healing Supervisor is that a consequential step stops and a named human is
// summoned; a summons that leads nowhere means the step stays paused, the incident
// stays open, and the operator concludes the tool is broken. Nothing in the test suite
// caught it because every existing test asserted that a notification was DELIVERED,
// never that the thing it pointed at could be reached.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConsoleUrl } from '../lib/supervisor/portable/host-context.ts'

const SITE_ROOT = 'https://saas.signalboostapp.com'

async function brandingWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env }
  process.env.OWNER_EMAILS = 'owner@example.com'
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  // Cache-busted so each case re-reads the environment.
  const mod = await import(`../self-healing-host/signalboost-host-context.ts?case=${Math.random()}`)
  const branding = mod.createSignalBoostHostContext().branding
  Object.assign(process.env, saved)
  return branding
}

test('the approval link points at the dashboard, not the site root', async () => {
  // The exact production configuration that produced the 404.
  const branding = await brandingWith({ NEXT_PUBLIC_APP_URL: SITE_ROOT, SUPERVISOR_CONSOLE_URL: undefined })
  const url = buildConsoleUrl(branding, 'supervisor/approvals')

  assert.equal(url, `${SITE_ROOT}/dashboard/supervisor/approvals`)
  assert.ok(url?.includes('/dashboard/'), 'dropping /dashboard sends every approver to a 404')
})

test('a trailing slash on the app url does not produce a double slash', async () => {
  const branding = await brandingWith({ NEXT_PUBLIC_APP_URL: `${SITE_ROOT}/`, SUPERVISOR_CONSOLE_URL: undefined })
  const url = buildConsoleUrl(branding, 'supervisor/approvals')

  assert.equal(url, `${SITE_ROOT}/dashboard/supervisor/approvals`)
  assert.ok(!url?.includes('//dashboard'), 'a double slash breaks routing on some hosts')
})

test('an unset app url still produces a reachable link', async () => {
  const branding = await brandingWith({ NEXT_PUBLIC_APP_URL: undefined, SUPERVISOR_CONSOLE_URL: undefined })
  assert.equal(buildConsoleUrl(branding, 'supervisor/approvals'), `${SITE_ROOT}/dashboard/supervisor/approvals`)
})

test('a deployment that mounts the console elsewhere can override it', async () => {
  // A buyer will not run their console at our path. The override is the supported
  // way to say so, and it must win over the derived default.
  const branding = await brandingWith({ NEXT_PUBLIC_APP_URL: SITE_ROOT, SUPERVISOR_CONSOLE_URL: 'https://ops.acme.internal/console' })
  assert.equal(buildConsoleUrl(branding, 'supervisor/approvals'), 'https://ops.acme.internal/console/supervisor/approvals')
})

test('the override tolerates a trailing slash too', async () => {
  const branding = await brandingWith({ SUPERVISOR_CONSOLE_URL: 'https://ops.acme.internal/console/' })
  assert.equal(buildConsoleUrl(branding, 'supervisor/approvals'), 'https://ops.acme.internal/console/supervisor/approvals')
})

test('the path the notifier asks for matches a real page in this app', async () => {
  // The other half of the bug: a correctly built URL is still useless if it names a
  // route that does not exist. This asserts the two agree.
  const { readFileSync, existsSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')

  const notifier = readFileSync(fileURLToPath(new URL('../lib/supervisor/portable/enterprise-notifier.ts', import.meta.url)), 'utf8')
  const requested = notifier.match(/buildConsoleUrl\([^,]+,\s*'([^']+)'\)/)?.[1]
  assert.ok(requested, 'the notifier must build its console link from a literal path')

  const page = fileURLToPath(new URL(`../app/dashboard/${requested}/page.tsx`, import.meta.url))
  assert.ok(existsSync(page), `the notifier links to /dashboard/${requested} but no page exists there`)
})
