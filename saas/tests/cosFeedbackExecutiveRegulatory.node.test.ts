import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { hashPrompt } from '../lib/ai/cos/turnExperienceStore.ts'
import {
  executiveDecisionDirective,
  regulatedHiringComplianceDirective,
} from '../lib/ai/cos/scriptRequestIntent.ts'
import {
  buildDiagnosticRepairPrompt,
  preferRepairedDraft,
  reasonerDraftNeedsRepair,
  unsupportedExecutiveQuantitativeClaims,
} from '../lib/ai/cos/reasonerQuality.ts'

const feedbackRoute = readFileSync(new URL('../app/api/assistant/feedback/route.ts', import.meta.url), 'utf8')

const hiringPrompt = 'If COS is asked to optimize hiring workflows using AI, how should it reconcile efficiency gains with fairness, bias mitigation, and compliance with EU AI Act and US EEOC rules?'

const executivePrompt = 'The Head of Sales has closed an enterprise contract worth $1.8M ARR that requires dedicated on-premises VPC tenant provisioning within 3 weeks. The VP of Infrastructure informs you that provisioning this tenant immediately will breach the Q3 infrastructure budget by 22% and consume 40% of the SRE team\'s capacity, delaying the planned multi-region redundancy failover project by 6 weeks. The CEO wants both delivered. Design the executive briefing memo for the CEO that frames the trade-off, quantifies the operational risk, and proposes an actionable decision matrix.'

test('turn prompt hash binds the original user question rather than injected internal context', () => {
  const expanded = `CONTINUOUS LEARNING CORPUS:\n[CL1] unrelated internal evidence\n\nUSER QUESTION:\n${executivePrompt}`
  assert.equal(hashPrompt(expanded), hashPrompt(executivePrompt))
})

test('feedback route waits for deferred server-owned turn correlation instead of losing a fast click', () => {
  assert.match(feedbackRoute, /TURN_CORRELATION_ATTEMPTS\s*=\s*5/)
  assert.match(feedbackRoute, /TURN_CORRELATION_RETRY_MS\s*=\s*125/)
  assert.match(feedbackRoute, /readTurnPromptHashWithRetry/)
  assert.match(feedbackRoute, /hashPrompt\(userPrompt\) !== correlation\.promptHash/)
})

test('regulated hiring question is routed to fresh authoritative evidence before conceptual fallback', () => {
  assert.equal(requiresFreshExternalEvidence(hiringPrompt), true)
})

test('regulated hiring guidance forbids reconstructing current EU AI Act or EEOC duties from model memory', () => {
  const directive = regulatedHiringComplianceDirective(hiringPrompt)
  assert.ok(directive)
  assert.match(directive, /CURRENT LEGAL CLAIMS REQUIRE AUTHORITATIVE EVIDENCE/i)
  assert.match(directive, /four-fifths\/80% rule/i)
  assert.match(directive, /Never turn a best practice into a claimed legal mandate/i)
})

test('executive decision mode covers the enterprise tenant trade-off and forbids invented precision', () => {
  const directive = executiveDecisionDirective(executivePrompt)
  assert.ok(directive)
  assert.match(directive, /Do not invent savings ranges, budget impacts, utilization levels/i)
  assert.match(directive, /Do not invent a workaround such as a phased\/MVP\/MVT delivery/i)
  assert.match(directive, /CEO wanting mutually constrained outcomes/i)
})

test('server quality gate detects the exact unsupported numbers from the bad executive memo', () => {
  const badAnswer = [
    '**DATE:** October 11, 2025',
    'Recommend a Minimum Viable Tenant in Week 3 and full hardening in Q4.',
    'Budget impact reduced to ~5%; SRE capacity impact reduced to ~10%.',
    'The SRE team is currently at 95% utilization.',
    'The supplied facts remain 22%, 40%, 3 weeks and 6 weeks.',
  ].join('\n')
  const raw = JSON.stringify({ answer: badAnswer, confidence: 0.78 })
  const unsupported = unsupportedExecutiveQuantitativeClaims(executivePrompt, raw)
  for (const claim of ['2025', 'q4', '5%', '10%', '95%']) assert.ok(unsupported.includes(claim), claim)
  assert.equal(reasonerDraftNeedsRepair(executivePrompt, raw), true)

  const repair = buildDiagnosticRepairPrompt(executivePrompt, raw)
  assert.match(repair, /Minimum Viable Tenant/)
  assert.match(repair, /Use placeholders such as \[Finance estimate required\]/)
  assert.match(repair, /CEO wanting both outcomes is a goal/i)
})

test('a repaired executive memo that uses only supplied quantitative facts is preferred', () => {
  const badRaw = JSON.stringify({
    answer: 'Use an MVT. Budget impact becomes 5%, SRE impact 10%, then finish in Q4 during 2025.',
    confidence: 0.78,
  })
  const repairedRaw = JSON.stringify({
    answer: 'Known facts: the contract is $1.8M ARR, requires provisioning within 3 weeks, immediate provisioning breaches the Q3 infrastructure budget by 22%, consumes 40% of SRE capacity, and delays redundancy by 6 weeks. Unknowns include contractual flexibility, additional resourcing, budget contingency, and the quantified consequence of delaying redundancy. Present those as decision conditions rather than assumptions.',
    confidence: 0.76,
  })
  assert.deepEqual(unsupportedExecutiveQuantitativeClaims(executivePrompt, repairedRaw), [])
  assert.equal(preferRepairedDraft(executivePrompt, badRaw, repairedRaw), true)
})
