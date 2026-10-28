import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requestsProductionAcceptanceExecution } from '../lib/builder/campaign/intent.ts'

test('explicit owner PAC execution is recognized, including product campaign ID', () => {
  for (const prompt of [
    'Execute the Production Acceptance Campaign (iTMounts-PAC-001).',
    'Run COS-PAC-001 against production and report the results.',
    'Start the production acceptance campaign.',
  ]) assert.equal(requestsProductionAcceptanceExecution(prompt), true, prompt)
})

test('analysis of a PAC brief is not execution authorization', () => {
  for (const prompt of [
    'Review the production acceptance campaign requirements.',
    'Summarize COS-PAC-001.',
    'Explain the PAC acceptance criteria.',
    'Run a calculator test.',
    'What is iTMounts?',
  ]) assert.equal(requestsProductionAcceptanceExecution(prompt), false, prompt)
})

test('host guard cannot bypass owner, Assistant surface, or campaign admission', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /authenticatedOwner && browserSurface === 'assistant' && requestsProductionAcceptanceExecution\(prompt\)/)
  assert.match(route, /reason: 'host_pac_execution_guard'/)
  assert.match(route, /agentDecision\.capabilities\.includes\('verification_campaign'\) && authenticatedOwner && browserSurface === 'assistant' && access\?\.userId/)
})
