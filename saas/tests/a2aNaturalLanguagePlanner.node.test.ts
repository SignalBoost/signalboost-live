import assert from 'node:assert/strict'
import test from 'node:test'
import { planCOSSpecialistFromText } from '../a2a-host/cos-specialist-planner.ts'

test('ordinary questions remain generalist', () => {
  const decision = planCOSSpecialistFromText('What is the difference between MCP and A2A?')
  assert.equal(decision.mode, 'generalist')
})

test('unclear domain text remains generalist', () => {
  const decision = planCOSSpecialistFromText('Help me think about next quarter.')
  assert.equal(decision.mode, 'generalist')
})

test('clear marketing research maps only to canonical advisory skill', () => {
  const decision = planCOSSpecialistFromText('Research our marketing audience and compare competitor channels.')
  assert.deepEqual(
    decision.mode === 'delegate' ? [decision.familyId, decision.skillId] : [],
    ['marketing', 'marketing.research'],
  )
})

test('clear paid campaign mutation maps to consequential canonical skill', () => {
  const decision = planCOSSpecialistFromText('Increase the Google Ads campaign budget for our marketing campaign.')
  assert.deepEqual(
    decision.mode === 'delegate' ? [decision.familyId, decision.skillId] : [],
    ['marketing', 'marketing.campaign-mutate'],
  )
})

test('sales outreach send and planning are distinguished', () => {
  const send = planCOSSpecialistFromText('Send a follow-up email to this sales prospect.')
  const plan = planCOSSpecialistFromText('Create a follow-up plan for this sales prospect.')
  assert.equal(send.mode, 'delegate')
  assert.equal(plan.mode, 'delegate')
  if (send.mode === 'delegate') assert.equal(send.skillId, 'sales.send-outreach')
  if (plan.mode === 'delegate') assert.equal(plan.skillId, 'sales.outreach-plan')
})

test('self-healing diagnosis does not become remediation', () => {
  const decision = planCOSSpecialistFromText('Diagnose why the production service failed and identify root cause.')
  assert.equal(decision.mode, 'delegate')
  if (decision.mode === 'delegate') {
    assert.equal(decision.familyId, 'self-healing-diagnostic')
    assert.equal(decision.skillId, 'self-healing.diagnose')
  }
})

test('self-healing repair intent selects consequential remediation', () => {
  const decision = planCOSSpecialistFromText('Repair the production service after this incident.')
  assert.equal(decision.mode, 'delegate')
  if (decision.mode === 'delegate') {
    assert.equal(decision.familyId, 'self-healing-remediation')
    assert.equal(decision.skillId, 'self-healing.apply-remediation')
  }
})

test('overlapping specialist matches fail back to generalist', () => {
  const decision = planCOSSpecialistFromText('Research the marketing account and sales opportunity for this campaign.')
  assert.equal(decision.mode, 'generalist')
  assert.equal(decision.reason, 'ambiguous specialist match')
})
