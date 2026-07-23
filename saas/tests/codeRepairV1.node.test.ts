import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCodeRepairContext, DEFAULT_CODE_REPAIR_CONTEXT_POLICY, normalizeCodeRepairFailure } from '../lib/code-repair/index.ts'

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'code-repair-v1-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'tests'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{}')
  await writeFile(join(root, 'src', 'math.ts'), 'export function add(a:number,b:number): number { return a + b }\n')
  await writeFile(join(root, 'tests', 'math.test.ts'), "import { add } from '../src/math'; add(1, 2)\n")
  return root
}

test('normalizes, classifies, sanitizes, bounds, and fingerprints failures deterministically', () => {
  const input = {
    incidentId: 'incident-1',
    repository: 'SignalBoost/signalboost-live',
    commitSha: 'abc123',
    workflowName: 'SaaS CI',
    failedJob: 'typecheck',
    logs: `TypeScript error API_KEY=private-value Bearer another-secret ${'x'.repeat(100)}`,
    changedFiles: ['src/math.ts', 'src/math.ts'],
    symbolHints: ['add', 'add'],
  }
  const policy = { ...DEFAULT_CODE_REPAIR_CONTEXT_POLICY, maximumLogCharacters: 80 }
  const first = normalizeCodeRepairFailure(input, policy)
  const second = normalizeCodeRepairFailure(input, policy)
  assert.equal(first.category, 'typecheck')
  assert.doesNotMatch(first.sanitizedLogs, /private-value|another-secret/)
  assert.match(first.sanitizedLogs, /\[TRUNCATED\]/)
  assert.deepEqual(first.changedFiles, ['src/math.ts'])
  assert.deepEqual(first.symbolHints, ['add'])
  assert.equal(first.fingerprint, second.fingerprint)
})

test('builds a read-only bounded repository context package with human approval required', async () => {
  const root = await fixture()
  try {
    const result = await buildCodeRepairContext(root, {
      incidentId: 'incident-2',
      repository: 'SignalBoost/signalboost-live',
      commitSha: 'def456',
      workflowName: 'SaaS CI',
      failedJob: 'unit tests',
      failedStep: 'node --test',
      logs: 'AssertionError in add',
      changedFiles: ['src/math.ts'],
      symbolHints: ['add'],
    })
    assert.equal(result.failure.category, 'unit_test')
    assert.equal(result.riskLevel, 'low')
    assert.equal(result.requiresHumanApproval, true)
    assert.equal(result.repositoryWritesAllowed, false)
    assert.equal(result.networkAccessAllowed, false)
    assert.equal(result.selectedContext.files.some(file => file.relativePath === 'src/math.ts'), true)
    assert.equal(result.selectedContext.files.some(file => file.relativePath === 'tests/math.test.ts'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('security and deployment failures are high risk', async () => {
  const root = await fixture()
  try {
    for (const category of ['security', 'deployment'] as const) {
      const result = await buildCodeRepairContext(root, {
        incidentId: `incident-${category}`,
        repository: 'SignalBoost/signalboost-live',
        commitSha: category,
        category,
        logs: `${category} failure`,
      })
      assert.equal(result.riskLevel, 'high')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects unsafe or invalid context policy values', async () => {
  const root = await fixture()
  try {
    await assert.rejects(
      buildCodeRepairContext(root, {
        incidentId: 'incident-invalid',
        repository: 'SignalBoost/signalboost-live',
        commitSha: 'invalid',
        logs: 'failure',
      }, { maximumSelectedFiles: 0 }),
      /Invalid code repair context policy/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
