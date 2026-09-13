// saas/tests/cosUniversityAgentModelPolicy.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  BUILDER_MODEL_NOT_CONFIGURED_FOR_ROLE,
  PRIMARY_REASONER_NOT_CONFIGURED,
  ROLE_DOMAIN_SUBJECTS,
  UNIVERSITY_PRACTICE_MODEL_INVALID,
  UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED,
  agentWorkDomain,
  modelForAgentWork,
  universityPracticeModelFromConfiguration,
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
  // Roles are declared over time. This asserts the RULE — an undeclared role stays generalist — using
  // whichever role is currently undeclared, so declaring one never turns this test red.
  const undeclared = ['aerospace_nuclear_safety', 'molecular_biomedical_sciences',
    'neuroscience_biophysics', 'actuarial_insurance_risk'].filter(role => !(role in ROLE_DOMAIN_SUBJECTS))
  assert.ok(undeclared.length, 'every registry role now declares a domain; pick a new example')
  for (const role of undeclared) {
    assert.equal(agentWorkDomain(role, 'physics_natural_sciences'), 'generalist', role)
    assert.equal(agentWorkDomain(role, 'computer_science'), 'generalist', role)
  }
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

test('DeepInfra deliberate practice requires an explicit configured economy model', () => {
  const beforeBase = process.env.LOCAL_AI_BASE_URL
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  const beforePrimary = process.env.LOCAL_AI_MODEL
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_MODEL = 'primary-strong'
  try {
    assert.throws(() => universityPracticeModelFromEnv(), new RegExp(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED))
    assert.throws(() => modelForAgentWork({ domain: 'role_domain', roleModel: 'builder-strong', purpose: 'practice' }),
      new RegExp(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED))
    assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'builder-strong', purpose: 'assessment' }), 'builder-strong')
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'builder-strong', purpose: 'assessment' }), 'primary-strong')
  } finally {
    if (beforeBase === undefined) delete process.env.LOCAL_AI_BASE_URL; else process.env.LOCAL_AI_BASE_URL = beforeBase
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
    if (beforePrimary === undefined) delete process.env.LOCAL_AI_MODEL; else process.env.LOCAL_AI_MODEL = beforePrimary
  }
})

test('buyer-controlled runtime configuration can satisfy the DeepInfra practice guard', () => {
  const beforeBase = process.env.LOCAL_AI_BASE_URL
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  try {
    assert.equal(universityPracticeModelFromConfiguration('buyer/economy-model'), 'buyer/economy-model')
    assert.equal(universityPracticeModelFromConfiguration({ model: 'buyer/economy-model-v2' }), 'buyer/economy-model-v2')
    assert.throws(() => universityPracticeModelFromConfiguration(null), new RegExp(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED))
  } finally {
    if (beforeBase === undefined) delete process.env.LOCAL_AI_BASE_URL; else process.env.LOCAL_AI_BASE_URL = beforeBase
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
  }
})

test('environment practice configuration remains authoritative over runtime configuration', () => {
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  process.env.UNIVERSITY_PRACTICE_MODEL = 'operator/env-model'
  try {
    assert.equal(universityPracticeModelFromConfiguration('buyer/db-model'), 'operator/env-model')
  } finally {
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
  }
})

test('malformed runtime practice model identifiers fail closed', () => {
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  try {
    assert.throws(() => universityPracticeModelFromConfiguration('model name with spaces'), new RegExp(UNIVERSITY_PRACTICE_MODEL_INVALID))
    assert.throws(() => universityPracticeModelFromConfiguration({ model: '../bad model' }), new RegExp(UNIVERSITY_PRACTICE_MODEL_INVALID))
  } finally {
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
  }
})

test('explicit practice model is used for DeepInfra non-credit work', () => {
  const beforeBase = process.env.LOCAL_AI_BASE_URL
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  process.env.UNIVERSITY_PRACTICE_MODEL = 'operator-selected-economy-model'
  try {
    assert.equal(universityPracticeModelFromEnv(), 'operator-selected-economy-model')
    assert.equal(modelForAgentWork({ domain: 'role_domain', roleModel: 'builder-strong', purpose: 'practice' }), 'operator-selected-economy-model')
    assert.equal(modelForAgentWork({ domain: 'generalist', roleModel: 'builder-strong', purpose: 'practice' }), 'operator-selected-economy-model')
  } finally {
    if (beforeBase === undefined) delete process.env.LOCAL_AI_BASE_URL; else process.env.LOCAL_AI_BASE_URL = beforeBase
    if (beforeProvider === undefined) delete process.env.LOCAL_AI_MANAGED_PROVIDER; else process.env.LOCAL_AI_MANAGED_PROVIDER = beforeProvider
    if (beforePractice === undefined) delete process.env.UNIVERSITY_PRACTICE_MODEL; else process.env.UNIVERSITY_PRACTICE_MODEL = beforePractice
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

test('host practice entry points use the service-only request-scoped configuration bridge', () => {
  const root = path.resolve(import.meta.dirname, '../lib/ai/cos')
  const configured = fs.readFileSync(path.join(root, 'cosUniversityConfiguredPracticeRunner.ts'), 'utf8')
  const context = fs.readFileSync(path.join(root, 'cosUniversityPracticeModelContext.ts'), 'utf8')
  const cycle = fs.readFileSync(path.join(root, 'cosUniversityAutonomousAgentCycle.ts'), 'utf8')
  const route = fs.readFileSync(path.resolve(import.meta.dirname, '../app/api/cron/cos-university-practice/route.ts'), 'utf8')
  const execution = fs.readFileSync(path.join(root, 'cosUniversityPracticeExecution.ts'), 'utf8')
  const specialist = fs.readFileSync(path.join(root, 'cosUniversityAgentExamRuntime.ts'), 'utf8')

  assert.match(configured, /COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY = 'cos_university_practice_model'/)
  assert.match(configured, /\.from\('system_settings'\)/)
  assert.match(configured, /runWithUniversityPracticeModel\(model/)
  assert.match(context, /new AsyncLocalStorage/)
  assert.match(route, /runConfiguredCosUniversityDeliberatePractice/)
  assert.match(cycle, /runConfiguredCosUniversityDeliberatePractice/)
  assert.match(execution, /currentUniversityPracticeModelOverride\(\)/)
  assert.match(specialist, /currentUniversityPracticeModelOverride\(\)/)
  for (const source of [configured, context, cycle, route, execution, specialist]) {
    assert.doesNotMatch(source, /deepseek-ai\/DeepSeek-V4-Flash-0731/)
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
