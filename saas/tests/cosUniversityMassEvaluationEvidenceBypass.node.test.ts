// saas/tests/cosUniversityMassEvaluationEvidenceBypass.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('mass evidence self-call carries the Vercel protection bypass header when the secret is set', () => {
  assert.match(source, /const bypassSecret=clean\(process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET,200\)/)
  assert.match(source, /\.\.\.\(bypassSecret\?\{'x-vercel-protection-bypass':bypassSecret\}:\{\}\)/)
})

test('without the bypass secret the evidence call targets the public origin, never an unprotected guess', () => {
  assert.match(source, /const target=!bypassSecret&&publicOrigin\?publicOrigin:origin/)
  assert.match(source, /fetch\(new URL\('\/api\/internal\/cos\/university-independent-evaluator\/evidence',target\)/)
})

test('HMAC headers and the http error name are unchanged', () => {
  assert.match(source, /'x-itmounts-evaluator-signature':signature/)
  assert.match(source, /throw new Error\(`independent_evaluator_evidence_http_\$\{response\.status\}`\)/)
})
