// saas/tests/cosUniversityRoleModelPolicy.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY,
  UNIVERSITY_ROLE_MODEL_INVALID,
  UNIVERSITY_ROLE_MODEL_NOT_CONFIGURED,
  universityRoleModelFromSetting,
  universityRoleModelNotConfigured,
} from '../lib/ai/cos/cosUniversityRoleModelPolicy.ts'
import { UNIVERSITY_SPECIALIST_ROLES } from '../lib/ai/cos/cosUniversitySpecialistRuntimes.ts'

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

test('both operator shapes resolve, and a role without an entry is simply unset', () => {
  const flat = { cybersecurity: 'vendor/security-model-v2' }
  const nested = { models: { cybersecurity: 'vendor/security-model-v2' } }
  assert.equal(universityRoleModelFromSetting(flat, 'cybersecurity'), 'vendor/security-model-v2')
  assert.equal(universityRoleModelFromSetting(nested, 'cybersecurity'), 'vendor/security-model-v2')
  assert.equal(universityRoleModelFromSetting(flat, 'quantum_theoretical_physics'), null)
  assert.equal(universityRoleModelFromSetting(nested, 'quantum_theoretical_physics'), null)
})

test('one role model never leaks to another role', () => {
  const setting = { cybersecurity: 'vendor/security-model-v2' }
  for (const role of UNIVERSITY_SPECIALIST_ROLES) {
    const resolved = universityRoleModelFromSetting(setting, role)
    assert.equal(resolved, role === 'cybersecurity' ? 'vendor/security-model-v2' : null, role)
  }
})

test('absent, empty and unusable settings resolve to unset rather than a default', () => {
  for (const value of [null, undefined, '', 0, [], {}, { models: {} }, { cybersecurity: '   ' }] as const) {
    assert.equal(universityRoleModelFromSetting(value as never, 'cybersecurity'), null)
  }
})

test('a malformed model id throws instead of degrading into unset', () => {
  // A typo must not become "not configured" and then get filled in by some other default.
  for (const bad of ['has space', 'bad<>chars', '-leading-dash', 'x'.repeat(200), 42, true, {}] as const) {
    assert.throws(
      () => universityRoleModelFromSetting({ cybersecurity: bad }, 'cybersecurity'),
      new RegExp(`${UNIVERSITY_ROLE_MODEL_INVALID}:cybersecurity`),
      String(bad),
    )
  }
})

test('the not-configured error names the role that is missing one', () => {
  assert.match(
    universityRoleModelNotConfigured('quantum_theoretical_physics').message,
    new RegExp(`^${UNIVERSITY_ROLE_MODEL_NOT_CONFIGURED}:quantum_theoretical_physics$`),
  )
})

test('the policy module reaches no store and holds no model of its own', () => {
  const code = file('lib/ai/cos/cosUniversityRoleModelPolicy.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const forbidden of ['cosServiceDb', 'supabase', 'system_settings', 'process.env', 'import ']) {
    assert.ok(!code.includes(forbidden), `role-model policy must not reference ${forbidden}`)
  }
})

test('the exam runtime resolves a role model instead of handing every role the coding model', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  // The literal this replaces: roleModel: requireBuilderCodingModel() for every registered role.
  assert.ok(!/roleModel:\s*requireBuilderCodingModel\(\)/.test(runtime),
    'the exam runtime still passes the coding model as every role model')
  assert.match(runtime, /roleModel,/)
  assert.match(runtime, /readUniversityRoleDomainModel\(await readCosUniversityAgentRole\(request\.agentId\)\)/)
  assert.match(runtime, /\.eq\('key', COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY\)/)
  assert.equal(COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY, 'cos_university_role_models')
})

test('software keeps its historical model and only domain work consults a role model', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  assert.match(runtime, /if \(id === SOFTWARE_CAPSTONE_ROLE\) return requireBuilderCodingModel\(\)/)
  // The generalist foundation, languages and retention must still run without any role model, so an
  // unconfigured specialist is blocked from its own field only, not from the whole curriculum.
  assert.match(runtime, /domain === 'role_domain' && !practiceOverride/)
})

test('non-credit practice keeps its own economy override ahead of any role model', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  const override = runtime.indexOf('const practiceOverride =')
  const resolve = runtime.indexOf('const roleModel = domain')
  assert.ok(override > 0 && override < resolve, 'practice override must be resolved before the role model')
})
