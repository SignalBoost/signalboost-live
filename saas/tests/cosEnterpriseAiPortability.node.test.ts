import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  COS_ENTERPRISE_AI_REQUIREMENTS,
  buildCosEnterpriseAiChecks,
  evaluateCosEnterpriseAiRelease,
  type CosEnterpriseAiEvidenceMap,
} from '../lib/release-candidate/cos-enterprise-ai.ts'

const tenant = { tenantId: 'buyer-1', environmentId: 'production' } as const
const observedAt = '2026-08-12T23:45:00-06:00'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

test('enterprise AI profile requires BYOM, BYOA, and optional Qwen/RunPod', () => {
  const ids = COS_ENTERPRISE_AI_REQUIREMENTS.map(row => row.checkId)
  assert.ok(ids.includes('cos.enterprise_ai.byom.model_port'))
  assert.ok(ids.includes('cos.enterprise_ai.byoa.agent_port'))
  assert.ok(ids.includes('cos.enterprise_ai.qwen.optional'))
  assert.ok(ids.includes('cos.enterprise_ai.runpod.optional'))
  assert.ok(ids.includes('cos.enterprise_ai.governance.model_not_authority'))
})

test('missing portability evidence can never be reported as enterprise ready', () => {
  const snapshot = evaluateCosEnterpriseAiRelease({ tenant, generatedAt: observedAt })
  assert.equal(snapshot.releaseCandidate, false)
  assert.equal(snapshot.notRunRequiredCheckIds.length, COS_ENTERPRISE_AI_REQUIREMENTS.length)
})

test('all required enterprise AI checks need explicit passing evidence', () => {
  const evidence = Object.fromEntries(COS_ENTERPRISE_AI_REQUIREMENTS.map(row => [
    row.checkId,
    {
      status: 'pass',
      evidence: [{ ref: `test:${row.checkId}`, kind: 'test', observedAt }],
    },
  ])) as CosEnterpriseAiEvidenceMap

  const checks = buildCosEnterpriseAiChecks(evidence)
  assert.equal(checks.every(check => check.status === 'pass' && check.evidence.length > 0), true)
  const snapshot = evaluateCosEnterpriseAiRelease({ tenant, generatedAt: observedAt, evidence })
  assert.equal(snapshot.releaseCandidate, true)
})

test('portable AI contracts themselves do not name Qwen or RunPod as required dependencies', () => {
  const portableContracts = [
    source('../lib/cos/aiPort.ts'),
    source('../agent-gateway/types.ts'),
    source('../agent-gateway/index.ts'),
    source('../cos-backup-core/ports.ts'),
  ].join('\n')

  assert.doesNotMatch(portableContracts, /\bqwen\b/i)
  assert.doesNotMatch(portableContracts, /\brunpod\b/i)
  assert.match(portableContracts, /interface CosAiPort/)
  assert.match(portableContracts, /bring-your-own agent/i)
  assert.match(portableContracts, /buyer['’]s model provider/i)
})

test('the buyer model seam is injected rather than a fixed provider identity', () => {
  const aiPort = source('../lib/cos/aiPort.ts')
  assert.match(aiPort, /export interface CosAiPort/)
  assert.match(aiPort, /generate\(input:/)
  assert.doesNotMatch(aiPort, /interface CosAiPort[\s\S]*qwen/i)
})
