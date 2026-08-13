import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDiagnosticRepairPrompt } from '@/lib/ai/cos/reasonerQuality'

const benchmark = 'A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged. Diagnose the most likely architectural causes, rank them, and explain how you would distinguish between them without making production changes.'

test('diagnostic repair forces a fresh mechanism-level solve instead of copying the rejected draft', () => {
  const rejected = '{"answer":"Resource Contention within Shared Infrastructure; Tenant-Specific Configuration; Network Issues","confidence":0.85}'
  const prompt = buildDiagnosticRepairPrompt(benchmark, rejected)

  assert.match(prompt, /solve the incident again from the original facts/i)
  assert.match(prompt, /enterprise-only/i)
  assert.match(prompt, /no deployment/i)
  assert.match(prompt, /unchanged overall traffic/i)
  assert.match(prompt, /state-dependent/i)
  assert.match(prompt, /do not reuse the headings/i)
  assert.doesNotMatch(prompt, /FIRST DRAFT TO REPLACE/i)
  assert.doesNotMatch(prompt, /Resource Contention within Shared Infrastructure/)
})
