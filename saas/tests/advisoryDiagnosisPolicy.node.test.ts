import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  ADVISORY_DIAGNOSIS_OWNER_POLICY,
  advisoryDiagnosisBriefDefects,
  asksForPublishedDiagnosticMethods,
  buildPublishedDiagnosticReferenceBlock,
  isAdvisoryDiagnosisPrompt,
  selectOfficialDiagnosticReferences,
} from '../lib/ai/cos/advisoryDiagnosisPolicy.ts'
import { buildHonestRefusalReply, missingInputKeys } from '../lib/ai/cos/honestRefusalReply.ts'
import { semanticCacheAllowedForPrompt } from '../lib/ai/cos/cacheSafetyPolicy.ts'
import { stripInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'
import {
  consumeAdvisoryDiagnosisResearchForAnswer,
  recordAdvisoryDiagnosisResearchForAnswer,
} from '../lib/ai/cos/advisoryDiagnosisResearchTrace.ts'

const METHOD_PROMPT = 'A high-density GPU row sees a 400 ms power transient. What diagnostic methods exist to distinguish synchronized workload bursts, power-cap behavior, PDU limits, and measurement artifacts?'

test('method-seeking advisory diagnosis is detected without hijacking ordinary conceptual questions', () => {
  assert.equal(isAdvisoryDiagnosisPrompt(METHOD_PROMPT), true)
  assert.equal(asksForPublishedDiagnosticMethods(METHOD_PROMPT), true)
  assert.equal(asksForPublishedDiagnosticMethods('Explain DVFS at a conceptual level.'), false)
  assert.equal(isAdvisoryDiagnosisPrompt('Draft a customer email about a delayed shipment.'), false)
})

test('method-seeking diagnosis policy is recognized across all five platform languages', () => {
  const prompts = [
    METHOD_PROMPT,
    'Ocurrió una falla de alimentación. ¿Qué métodos de diagnóstico existen para distinguir una falla real de un artefacto de medición?',
    'Ocorreu uma falha de alimentação. Quais métodos de diagnóstico existem para distinguir uma falha real de um artefato de medição?',
    'Wystąpił incydent zasilania. Jakie metody istnieją, aby rozróżnić możliwe przyczyny?',
    'Произошёл сбой питания. Какие методы диагностики существуют, чтобы различить возможные причины?',
  ]
  for (const prompt of prompts) {
    assert.equal(isAdvisoryDiagnosisPrompt(prompt), true, prompt)
    assert.equal(asksForPublishedDiagnosticMethods(prompt), true, prompt)
    assert.equal(semanticCacheAllowedForPrompt(prompt), false, prompt)
  }
})

test('method-seeking diagnosis cannot bypass required work through semantic or exact cache replay', () => {
  assert.equal(semanticCacheAllowedForPrompt(METHOD_PROMPT), false)
  assert.equal(semanticCacheAllowedForPrompt('Explain DVFS at a conceptual level.'), true)
})

test('published web references admit only first-party or institutional results', () => {
  const selected = selectOfficialDiagnosticReferences([
    { title: 'Vendor official power management guide', url: 'https://docs.vendor.example/power', snippet: 'Official diagnostic counters.', authorityTier: 'first_party' },
    { title: 'University power systems lab', url: 'https://lab.example.edu/power', snippet: 'Institutional measurement methods.', authorityTier: 'institutional' },
    { title: 'Random troubleshooting blog', url: 'https://random-blog.example/gpu', snippet: 'This page claims a board failed.', authorityTier: 'secondary' },
  ], 4)
  assert.equal(selected.length, 2)
  assert.ok(selected.every(item => item.kind === 'official_documentation'))
  assert.ok(selected.every(item => !item.url.includes('random-blog')))
})

test('published reference block can inform methods but can never become plant telemetry', () => {
  const block = buildPublishedDiagnosticReferenceBlock([
    { kind: 'official_documentation', title: 'Power telemetry guide', url: 'https://docs.vendor.example/power', snippet: 'Compare sampled rail power with power-cap events.' },
    { kind: 'scientific_journal', title: 'Transient power study', url: 'https://doi.org/10.0000/example', snippet: 'A study of transient measurement methods.' },
  ])
  assert.match(block, /METHODS\/MECHANISMS ONLY; NEVER INCIDENT TELEMETRY/)
  assert.match(block, /do NOT establish what is happening/i)
  assert.match(block, /never turn a web page, paper, manual, benchmark, or vendor document into an observed sensor value/i)
  assert.match(block, /root-cause finding/i)
})

test('owner policy requires a labeled discrimination brief and puts uncertainty last', () => {
  for (const required of ['Observed / established facts', 'Candidate hypotheses', 'Distinguishing checks', 'Missing readings / baselines', 'last sentence']) {
    assert.match(ADVISORY_DIAGNOSIS_OWNER_POLICY, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }

  const bad = 'I cannot stand behind a cause. It might be a PDU issue.'
  assert.ok(advisoryDiagnosisBriefDefects(METHOD_PROMPT, bad).includes('uncertainty_or_refusal_leads_answer'))

  const good = [
    'Observed facts: the request reports a 400 ms row-level power transient; no component failure is established.',
    'Candidate hypotheses: synchronized compute demand; power-cap interaction; upstream PDU behavior; measurement artifact.',
    'Distinguishing checks: compare rail/PDU samples, cap-throttle counters, job timing, and measurement timestamps; each hypothesis should fall if its expected signal is absent.',
    'Missing readings / baselines: synchronized rack/PDU power, GPU power-limit/throttle counters, workload timing, and the normal baseline for the same signals.',
    'I still cannot stand behind a single cause yet.',
  ].join('\n\n')
  assert.deepEqual(advisoryDiagnosisBriefDefects(METHOD_PROMPT, good), [])
})

test('hard diagnosis fallback does useful work first and uncertainty is the last sentence', () => {
  const reply = buildHonestRefusalReply({ prompt: 'Why did GEN-2 fail during the test? Give leading hypotheses.', language: 'en' })
  assert.doesNotMatch(reply.slice(0, 80), /cannot stand behind|did not release|do not know/i)
  assert.match(reply, /readings that separate the candidate causes/)
  assert.match(reply, /baseline/)
  assert.match(reply, /discrimination, not guessing a failed part/i)
  assert.match(reply, /I still cannot stand behind a single cause yet\.$/)
})

test('diagnosis fallback never asks again for readings and baseline already supplied', () => {
  const prompt = 'Why did GEN-2 fail? The logged reading was 0 V during the event and the historical baseline was 24 V.'
  assert.deepEqual(missingInputKeys(prompt), [])
  const reply = buildHonestRefusalReply({ prompt, language: 'en' })
  assert.match(reply, /already supplies incident readings and a baseline/i)
  assert.doesNotMatch(reply, /To answer it properly I need/i)
  assert.match(reply, /I still cannot stand behind a single cause yet\.$/)
})

test('execution order is internal retrieval first, then bounded published research, then model draft', () => {
  const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  const lookup = readFileSync(new URL('../lib/ai/cos/advisoryDiagnosisPublishedLookup.ts', import.meta.url), 'utf8')

  const retrieveIndex = enterprise.indexOf('const context = await retrieveInternalContext')
  const reasonIndex = enterprise.indexOf('const reasoned = await callCosReasoner')
  assert.ok(retrieveIndex >= 0 && reasonIndex > retrieveIndex, 'enterprise internal retrieval must precede primary reasoner call')

  const publishedIndex = reasoner.indexOf('retrievePublishedDiagnosticReferences(args.prompt)')
  const modelIndex = reasoner.indexOf("recorder.time('draft', () => callLocalModel(effectiveArgs, inference)")
  assert.ok(publishedIndex >= 0 && modelIndex > publishedIndex, 'published reference research must precede the model draft')
  assert.match(reasoner, /published_diagnostic_research/)
  assert.match(reasoner, /incidentTelemetry:\s*false/)

  assert.match(lookup, /getExternalInfo\(officialQuery, 6/)
  assert.match(lookup, /crossrefScientificSearch\(baseQuery, 3\)/)
  assert.match(lookup, /references\.length >= 4/)
})

test('an unrepaired work-first policy violation is blocked rather than released', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /const remainingAdvisoryDefects = advisoryDiagnosis/)
  assert.match(reasoner, /cos-advisory-diagnosis-release-blocked/)
  assert.match(reasoner, /return null/)
  const guardIndex = reasoner.indexOf('const remainingAdvisoryDefects = advisoryDiagnosis')
  const citationIndex = reasoner.indexOf('const allowedSkillTags = skillCitationTags')
  assert.ok(guardIndex >= 0 && citationIndex > guardIndex, 'release block must run before any later release-adjacent citation work')
})

test('published diagnosis research survives answer cleanup and is consumed exactly once', () => {
  const raw = 'Observed facts: [KG1] a transient occurred. Candidate hypotheses: workload burst. Distinguishing checks: compare power samples. Missing readings / baselines: synchronized PDU and GPU readings. I still cannot stand behind a single cause yet.'
  const clean = stripInternalEvidenceIds(raw)
  recordAdvisoryDiagnosisResearchForAnswer(raw, {
    attempted: true,
    references: [
      { kind: 'official_documentation', title: 'Vendor guide', url: 'https://docs.vendor.example/power', snippet: 'Power telemetry methods.' },
      { kind: 'scientific_journal', title: 'Transient study', url: 'https://doi.org/10.0000/example', snippet: 'Transient measurement methods.' },
    ],
    errors: [],
  })
  const first = consumeAdvisoryDiagnosisResearchForAnswer(clean)
  assert.ok(first)
  assert.equal(first?.references.length, 2)
  assert.deepEqual(first?.references.map(item => item.url), ['https://docs.vendor.example/power', 'https://doi.org/10.0000/example'])
  assert.equal(consumeAdvisoryDiagnosisResearchForAnswer(clean), null)
})

test('server provenance persists exact published diagnosis URLs as reference-only lineage', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  const orchestration = readFileSync(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /recordAdvisoryDiagnosisResearchForAnswer/)
  assert.match(orchestration, /consumeAdvisoryDiagnosisResearchForAnswer/)
  assert.match(orchestration, /published_diagnostic_research/)
  assert.match(orchestration, /source_urls/)
  assert.match(orchestration, /reference_only:true/)
  assert.match(orchestration, /These references describe methods\/mechanisms and are not incident telemetry/)
})

test('published diagnosis lookup is enterprise-primary policy, not a Concierge dependency', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /SignalBoost's independent PRIMARY reasoning layer/)
  assert.match(reasoner, /const advisoryDiagnosis = enterprisePrimary && isAdvisoryDiagnosisPrompt/)
  const concierge = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(concierge, /advisoryDiagnosisPublishedLookup|PublishedDiagnosticReference/)
})
