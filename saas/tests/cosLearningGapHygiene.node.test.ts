//
// Guards two defects found in production data on 2026-08-17:
//  1. chat fragments ("worse president times", "show components relationships",
//     "computer vision subfield") became durable study subjects and were re-studied daily, i.e.
//     sent to journal APIs as research queries;
//  2. every queued gap was marked resolved whenever the cycle accepted anything at all, so gaps
//     that produced no evidence were closed as if they had been answered.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isStudyableGapSubject,
  normalizeDynamicStudyGaps,
  normalizeQueuedGapSubject,
  queuedGapResolution,
} from '../lib/cos/dailyAutonomousLearning'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '../lib/cos-core/layers/learning/foundational'

test('only a foundational study domain counts as a studyable subject', () => {
  for (const domain of FOUNDATIONAL_KNOWLEDGE_DOMAINS) {
    assert.ok(isStudyableGapSubject(domain.subject), domain.subject)
    assert.ok(isStudyableGapSubject(`  ${domain.subject.toUpperCase()}  `), 'match should ignore case and padding')
  }
  assert.equal(isStudyableGapSubject(''), false)
  // Real capability classes, but not research topics — journals have nothing useful to say here.
  assert.equal(isStudyableGapSubject('opinion and judgment'), false)
  assert.equal(isStudyableGapSubject('general reasoning'), false)
})

test('the exact fragments seen in production are dropped instead of studied', () => {
  assert.equal(normalizeQueuedGapSubject('worse president times', 'who were the worse presidents of all times'), null)
  assert.equal(normalizeQueuedGapSubject('show components relationships', 'show me your components and their relationships'), null)
  assert.equal(normalizeQueuedGapSubject('computer vision subfield', 'is computer vision a subfield of what'), null)
  assert.equal(normalizeQueuedGapSubject('', ''), null)
})

test('a legacy free-text subject is re-anchored when its own question maps to a study domain', () => {
  const subject = normalizeQueuedGapSubject(
    'multi tenant saas suddenly shows',
    'A multi-tenant SaaS shows normal database CPU but API p95 latency triples only for enterprise tenants',
  )
  assert.ok(subject, 'a classifiable question produced no subject')
  assert.ok(isStudyableGapSubject(subject))
  assert.notEqual(subject, 'multi tenant saas suddenly shows')
})

test('an already-studyable subject is passed through untouched', () => {
  const domain = FOUNDATIONAL_KNOWLEDGE_DOMAINS[0].subject
  assert.equal(normalizeQueuedGapSubject(domain, ''), domain)
  assert.equal(normalizeQueuedGapSubject(domain, 'unrelated question text'), domain)
})

test('dynamic corpus gaps cannot bypass subject hygiene into acquisition', () => {
  const gaps = normalizeDynamicStudyGaps([
    {
      id: 'dynamic:computer-vision-fragment',
      subject: 'computer vision subfield',
      question: 'is computer vision a subfield of what',
      portableIds: ['cos'],
      expectedReuse: 1,
      expectedAvoidedCostUsd: 0,
      urgency: 50,
      evidence: [],
    },
    {
      id: 'dynamic:tenant-latency',
      subject: 'multi tenant saas suddenly shows',
      question: 'A multi-tenant SaaS has normal database CPU but enterprise API p95 latency triples',
      portableIds: ['cos'],
      expectedReuse: 1,
      expectedAvoidedCostUsd: 0,
      urgency: 50,
      evidence: [],
    },
  ])

  assert.equal(gaps.some(gap => gap.subject === 'computer vision subfield'), false)
  assert.equal(gaps.length, 1)
  assert.ok(isStudyableGapSubject(gaps[0].subject))
  assert.equal(/computer vision subfield/i.test(gaps[0].question), false)
})

test('only a gap whose own subject produced evidence is resolved', () => {
  const accepted = ['SRE and observability', 'Enterprise cybersecurity']
  assert.equal(queuedGapResolution('SRE and observability', accepted), 'resolved')
  assert.equal(queuedGapResolution('  sre and observability  ', accepted), 'resolved')
  assert.equal(queuedGapResolution('Database and data-layer performance', accepted), 'failed')
  assert.equal(queuedGapResolution('SRE and observability', []), 'failed')
})
