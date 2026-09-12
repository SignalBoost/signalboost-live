// saas/tests/cosUniversityAgentModelPolicy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE,
  DEEPINFRA_ECONOMY_PRACTICE_MODEL,
  PRIMARY_REASONER_NOT_CONFIGURED,
  ROLE_DOMAIN_SUBJECTS,
  agentWorkDomain,
  modelForAgentWork,
  universityPracticeModelFromEnv,
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

test('domain assessment work uses the role model', () => {
  assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'coder-x', purpose: 'assessment' }), 'coder-x')
})

test('generalist assessment work uses the platform reasoner, not the role model', () => {
  const before = process.env.LOCAL_AI_MODEL
  process.env.LOCAL_AI_MODEL = 'reasoner-y'
  try {
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'coder-x', purpose: 'assessment' }), 'reasoner-y')
  } finally {
    if (before === undefined) delete process.env.LOCAL_AI_MODEL
    else process.env.LOCAL_AI_MODEL = before
  }
})

test('DeepInfra deliberate practice uses the economy model while assessments stay strong', () => {
  const beforeBase = process.env.LOCAL_AI_BASE_URL
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  const beforePrimary = process.env.LOCAL_AI_MODEL
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_MODEL = 'primary-strong'
  try {
    assert.equal(universityPracticeModelFromEnv(), DEEPINFRA_ECONOMY_PRACTICE_MODEL)
    assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'builder-strong', purpose: 'practice' }), DEEPINFRA_ECONOMY_PRACTICE_MODEL)
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'builder-strong', purpose: 'practice' }), DEEPINFRA_ECONOMY_PRACTICE_MODEL)
    assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'builder-strong', purpose: 'assessment' }), 'builder-strong')
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'builder-strong', purpose: 'assessment' }), 'primary-strong')
  } finally {
    if (beforeBase === undefined) delete process.env.LOCAL_AI_BASE_URL; else process.env.LOCAL_AI_BASE_URL = beforeBase
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
    if (beforePrimary === undefined) delete process.env.LOCAL_AI_MODEL; else process.env.LOCAL_AI_MODEL = beforePrimary
  }
})

test('explicit practice model overrides the DeepInfra economy default', () => {
  const before = process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.UNIVERSITY_PRACTICE_MODEL = 'operator-selected-economy-model'
  try {
    assert.equal(universityPracticeModelFromEnv(), 'operator-selected-economy-model')
  } finally {
    if (before === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL
    else process.env.UNIVERSITY_PRACTICE_MODEL = before
  }
})

test('neither graded model is ever substituted silently', () => {
  assert.throws(() => modelForAgentWork({ domain: 'role_domain', roleModel: '  ', purpose: 'assessment' }),
    new RegExp(BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE))
  const before = process.env.LOCAL_AI_MODEL
  delete process.env.LOCAL_AI_MODEL
  try {
    assert.throws(() => modelForAgentWork({ domain: 'generalist', roleModel: 'coder-x', purpose: 'assessment' }),
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
