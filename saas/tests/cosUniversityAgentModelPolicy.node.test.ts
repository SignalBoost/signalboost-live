// saas/tests/cosUniversityAgentModelPolicy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE,
  PRIMARY_REASONER_NOT_CONFIGURED,
  ROLE_DOMAIN_SUBJECTS,
  agentWorkDomain,
  modelForAgentWork,
} from '../lib/ai/cos/cosUniversityAgentModelPolicy.ts'

test('a subject inside the role field is domain work; everything else is generalist', () => {
  assert.equal(agentWorkDomain('software_engineering', 'computer_science'), 'role_domain')
  assert.equal(agentWorkDomain('software_engineering', 'history_culture_philosophy_religion'), 'generalist')
  assert.equal(agentWorkDomain('software_engineering', 'language_communication'), 'generalist')
  assert.equal(agentWorkDomain('cybersecurity', 'cybersecurity'), 'role_domain')
  assert.equal(agentWorkDomain('cybersecurity', 'computer_science'), 'generalist')
})

test('an unknown role or missing subject falls to generalist, never to the role model', () => {
  assert.equal(agentWorkDomain('quantum_theoretical_physics', 'physics_natural_sciences'), 'generalist')
  assert.equal(agentWorkDomain(null, 'computer_science'), 'generalist')
  assert.equal(agentWorkDomain('software_engineering', null), 'generalist')
  assert.equal(agentWorkDomain('software_engineering', ''), 'generalist')
})

test('domain work uses the role model', () => {
  assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'coder-x' }), 'coder-x')
})

test('generalist work uses the platform reasoner, not the role model', () => {
  const before = process.env.LOCAL_AI_MODEL
  process.env.LOCAL_AI_MODEL = 'reasoner-y'
  try {
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'coder-x' }), 'reasoner-y')
  } finally {
    if (before === undefined) delete process.env.LOCAL_AI_MODEL
    else process.env.LOCAL_AI_MODEL = before
  }
})

test('neither model is ever substituted silently', () => {
  assert.throws(() => modelForAgentWork({ domain: 'role_domain', roleModel: '  ' }),
    new RegExp(BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE))
  const before = process.env.LOCAL_AI_MODEL
  delete process.env.LOCAL_AI_MODEL
  try {
    assert.throws(() => modelForAgentWork({ domain: 'generalist', roleModel: 'coder-x' }),
      new RegExp(PRIMARY_REASONER_NOT_CONFIGURED))
  } finally {
    if (before !== undefined) process.env.LOCAL_AI_MODEL = before
  }
})

test('every declared domain subject belongs to a registered role', () => {
  const registered = new Set([
    'software_engineering', 'cybersecurity', 'quantitative_data_science',
    'enterprise_operations_governance', 'scientific_physical_systems', 'aerospace_nuclear_safety',
    'molecular_biomedical_sciences', 'neuroscience_biophysics', 'actuarial_insurance_risk',
    'quantum_theoretical_physics',
  ])
  for (const role of Object.keys(ROLE_DOMAIN_SUBJECTS)) {
    assert.ok(registered.has(role), `${role} is not a registry role`)
    assert.ok(ROLE_DOMAIN_SUBJECTS[role].length > 0, `${role} declares no subjects`)
  }
})
