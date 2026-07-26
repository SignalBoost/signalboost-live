// saas/tests/supervisorNavigation.node.test.ts
//
// This suite reads navbar SOURCE, which is fragile by construction. Its previous assertions
// pinned hand-written JSX — `const supervisorSocLabel = '...'` and
// `ownerAccess ? <Link href="/dashboard/supervisor"` — that no longer exists: the navbar is now
// a data-driven list of entry objects. The behaviour it was protecting is intact, so the
// assertions were rewritten to check the PROPERTIES of the entry rather than the shape of the
// markup that renders it. Written this way they survive the next refactor and still fail if the
// emergency stop is unlinked, ungated, or stripped of its icon.
//
// The visible label now comes from the locale key rather than a literal, so the exact wording is
// deliberately not asserted here — asserting it would just re-create the problem.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const navbar = readFileSync(new URL('../components/PremiumCustomerNavbarV2.tsx', import.meta.url), 'utf8')

/** The single navbar entry object whose href is exactly the supervisor root. */
function supervisorEntry(): string {
  const entry = navbar
    .split('\n')
    .find(line => /href:\s*'\/dashboard\/supervisor'/.test(line))
  assert.ok(entry, 'no navbar entry links to /dashboard/supervisor')
  return entry
}

test('Supervisor SOC has a persistent navbar entry', () => {
  const entry = supervisorEntry()
  assert.match(entry, /href:\s*'\/dashboard\/supervisor'/)
  assert.match(entry, /labelKey:\s*'nav\.supervisorSOC'/)
})

test('the Supervisor SOC entry is owner gated', () => {
  assert.match(supervisorEntry(), /requiresOwner:\s*true/)
  assert.match(navbar, /requiresOwner\?:\s*boolean/)
})

test('the Supervisor SOC entry keeps its emergency-stop icon', () => {
  assert.match(supervisorEntry(), /icon:\s*'🛑'/)
})

test('navigating closes the mobile menu', () => {
  assert.match(navbar, /setMobileOpen\(false\)/)
})
