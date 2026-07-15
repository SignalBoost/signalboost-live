import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  verifySignalBoostSupervisorSignature,
  verifyVercelWebhookSignature,
} from '../lib/autonomous-supervisor/vercel'
import { validateDiagnostic } from '../lib/autonomous-supervisor/diagnostic'

const previousSecret = process.env.COS_SUPERVISOR_WEBHOOK_SECRET
process.env.COS_SUPERVISOR_WEBHOOK_SECRET = 'test-secret'

test.after(() => {
  if (previousSecret === undefined) delete process.env.COS_SUPERVISOR_WEBHOOK_SECRET
  else process.env.COS_SUPERVISOR_WEBHOOK_SECRET = previousSecret
})

test('accepts native Vercel HMAC-SHA1 signatures', () => {
  const body = '{"type":"deployment.error"}'
  const signature = createHmac('sha1', 'test-secret').update(body).digest('hex')
  assert.equal(verifyVercelWebhookSignature(body, signature), true)
  assert.equal(verifyVercelWebhookSignature(body + 'x', signature), false)
})

test('accepts SignalBoost HMAC-SHA256 signatures', () => {
  const body = '{"type":"deployment.error"}'
  const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
  assert.equal(verifySignalBoostSupervisorSignature(body, `sha256=${signature}`), true)
})

test('requires the Thinker to preserve incident_id exactly', () => {
  const base = {
    incident_id: 'INC-001',
    incident_summary: 'Deployment failed.',
    diagnosis: 'Missing configuration.',
    confidence_score: 80,
    confidence_reason: 'The build log names the missing setting.',
    evidence: [],
    missing_information: [],
    recommended_execution_method: 'ui_agent',
    requires_ui_agent: true,
    requires_human_approval: true,
    risk_level: 'high',
    risk_reasons: [],
    repair_plan: [{ step: 1, action: 'Inspect configuration.', executor: 'ui_agent', target: 'Vercel', expected_result: 'Configuration is identified.', requires_approval: true }],
    verification_plan: [],
    rollback_plan: [],
    escalation_reason: null,
  }
  assert.equal(validateDiagnostic(base, 'INC-001').incident_id, 'INC-001')
  assert.throws(() => validateDiagnostic({ ...base, incident_id: 'INC-002' }, 'INC-001'), /incident_id/)
})
