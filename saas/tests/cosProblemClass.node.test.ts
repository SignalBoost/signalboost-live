// saas/tests/cosProblemClass.node.test.ts
//
// Pins the grouping key the learning loop depends on. The cases below are the ACTUAL subjects
// observed in the production independence report on 2026-08-16, where verbatim prompts had become
// subjects and every ordinary turn collapsed into 'general reasoning'.

import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyProblemClass, knownProblemClasses, UNCLASSIFIED_PROBLEM_CLASS } from '../lib/ai/cos/cosProblemClass.ts'

test('never returns the prompt itself — unbounded subjects are the defect being removed', () => {
  const prompts = [
    'What is computer vision a subfield of?',
    '“Show me COS components and their relationships',
    'who is the worse US president of all times?',
    'Who is the current US president?',
  ]
  for (const prompt of prompts) {
    const subject = classifyProblemClass(prompt)
    assert.notEqual(subject, prompt, `subject must not be the verbatim prompt: ${prompt}`)
    assert.ok(subject.length <= 80, `subject should be a class, not prose: ${subject}`)
  }
})

test('the same question in different words lands in ONE class (recurrence can concentrate)', () => {
  const a = classifyProblemClass('Who is the current US president?')
  const b = classifyProblemClass('Who is the current President of the United States?')
  const c = classifyProblemClass('who is currently the president of the united states?')
  assert.equal(a, b)
  assert.equal(b, c)
  assert.equal(a, 'current public facts')
})

test('foundational study domains still win, so curriculum and experience share vocabulary', () => {
  assert.match(
    classifyProblemClass('How should an SRE diagnose tail-latency regressions in multi-tenant SaaS?'),
    /site reliability engineering/,
  )
  assert.match(
    classifyProblemClass('How do PostgreSQL query plans and pg_stat_statements differ for large tenants?'),
    /PostgreSQL/,
  )
})

test('injected evidence cannot move learning telemetry out of the user-question bucket', () => {
  const wrapped = [
    'DATABASE EVIDENCE: PostgreSQL query plan, pg_stat_statements, indexes, buffer cache.',
    'MORE EVIDENCE: PostgreSQL database tenant connection pool.',
    'USER QUESTION:',
    'Enterprise tenant p95 latency tripled with unchanged traffic. Diagnose the incident using traces and isolation points.',
  ].join('\n')
  assert.match(classifyProblemClass(wrapped), /site reliability engineering/)

  const freshWrapped = [
    'Retrieved corpus: PostgreSQL database performance and connection pools.',
    'Original question: What is the latest public office holder for this role?',
    'Evidence follows below.',
  ].join('\n')
  assert.equal(classifyProblemClass(freshWrapped), 'current public facts')
})

test('ordinary turns split into real classes instead of one giant bucket', () => {
  assert.equal(classifyProblemClass('What is computer vision a subfield of?'), 'definitions and concepts')
  assert.equal(classifyProblemClass('who is the worse US president of all times?'), 'opinion and judgment')
  assert.equal(classifyProblemClass('Write a short launch email for our new pricing'), 'writing and content')
  assert.equal(classifyProblemClass('Should we prioritise hiring or fundraising next quarter?'), 'planning and strategy')
})

test('a foundational domain outranks a general intent when both match', () => {
  assert.match(
    classifyProblemClass('Should we prioritise the latency fix or the corpus work?'),
    /site reliability engineering/,
  )
})

test('cardinality stays bounded and the fallback is genuinely last resort', () => {
  const classes = knownProblemClasses()
  assert.ok(classes.length <= 20, 'taxonomy must stay a closed, knowable set')
  assert.ok(classes.includes(UNCLASSIFIED_PROBLEM_CLASS))
  assert.equal(classifyProblemClass(''), UNCLASSIFIED_PROBLEM_CLASS)
  assert.equal(classifyProblemClass('   '), UNCLASSIFIED_PROBLEM_CLASS)
})
