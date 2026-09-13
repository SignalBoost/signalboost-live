// saas/tests/cosUniversitySpecialistRuntimes.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SOFTWARE_SPECIALIST_RUNTIME,
  UNIVERSITY_SPECIALIST_ROLES,
  isBoundSpecialistIdentity,
  universitySpecialistRuntime,
  universitySpecialistTitle,
} from '../lib/ai/cos/cosUniversitySpecialistRuntimes.ts'

const capstone = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityAgentCapstone.ts'), 'utf8')
const registry = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260910133222_cos_university_agent_registry.sql'), 'utf8')

test('software keeps its exact historical runtime, because written evidence depends on it', () => {
  assert.equal(SOFTWARE_SPECIALIST_RUNTIME, 'university_software_specialist_v1')
  assert.equal(universitySpecialistRuntime('software_engineering'), 'university_software_specialist_v1')
})

test('every registered role has its own runtime and title', () => {
  const runtimes = new Set<string>()
  for (const role of UNIVERSITY_SPECIALIST_ROLES) {
    const runtime = universitySpecialistRuntime(role)
    assert.ok(runtime, `${role} has no runtime`)
    assert.ok(universitySpecialistTitle(role), `${role} has no title`)
    // The database binding matches this shape; a runtime outside it can never be written.
    assert.match(String(runtime), /^university_[a-z][a-z_]{2,60}_v1$/, String(runtime))
    assert.ok(!runtimes.has(String(runtime)), `${runtime} is shared by two roles`)
    runtimes.add(String(runtime))
  }
})

test('the role list matches the registry the database actually enforces', () => {
  for (const role of UNIVERSITY_SPECIALIST_ROLES) {
    assert.ok(registry.includes(`'${role}'`), `${role} is not a registry role`)
  }
  // COS is the generalist and must never appear as a bound specialist role.
  assert.ok(!(UNIVERSITY_SPECIALIST_ROLES as readonly string[]).includes('chief_of_staff_generalist'))
})

test('an unknown role gets no runtime and cannot execute', () => {
  for (const role of [null, undefined, '', 'marketing', 'chief_of_staff_generalist', 42, {}]) {
    assert.equal(universitySpecialistRuntime(role), null, String(role))
    assert.equal(isBoundSpecialistIdentity('some-agent', role), false, String(role))
  }
})

test('COS can never hold a bound specialist identity', () => {
  assert.equal(isBoundSpecialistIdentity('cos', 'software_engineering'), false)
  assert.equal(isBoundSpecialistIdentity('software-specialist', 'software_engineering'), true)
  assert.equal(isBoundSpecialistIdentity('cyber-specialist', 'cybersecurity'), true)
})

test('malformed agent ids are refused whatever the role', () => {
  for (const id of ['', ' ', 'Has Caps', 'has space', '-leading', 'a'.repeat(200)]) {
    assert.equal(isBoundSpecialistIdentity(id, 'cybersecurity'), false, JSON.stringify(id))
  }
})

test('the executor no longer names one role as a literal', () => {
  assert.match(capstone, /isBoundSpecialistIdentity\(request\.agentId, role\)/)
  assert.match(capstone, /const runtime = universitySpecialistRuntime\(role\)/)
  assert.match(capstone, /You are the registered \$\{roleTitle\}/)
  assert.match(capstone, /Your host role is \$\{role\}/)
  assert.ok(!/role: SOFTWARE_CAPSTONE_ROLE,/.test(capstone), 'the receipt still stamps the software role')
})

test('a receipt is checked against the role it declares, not against software', () => {
  assert.match(capstone, /e\.role === role && e\.runtime === universitySpecialistRuntime\(role\)/)
})
