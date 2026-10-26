import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCosSoftwareDelivery, isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

test('Phantom Writes investigation remains a chat analysis, not a Builder job', () => {
  const prompt = `Complicated Debug Scenario: Phantom Writes in a Distributed Queue Worker
Your system uses Redis Streams, bullmq, PostgreSQL, Redis, Redlock, and Docker Swarm.
Code Snippet (Worker)
const worker = new Worker("jobs", async job => {
  const lock = await redlock.acquire([\`lock:\${job.id}\`], 2000);
  await db.query("INSERT INTO results(data) VALUES($1)", [result]);
});
Debugging Tasks for Your Builder:
Identify root cause — Determine which subsystem is responsible for phantom writes.
Trace job lifecycle — Reconstruct creation to datastore write.
Detect race conditions — Analyze lock timing vs execution time.
Audit logging accuracy — Determine whether logs reflect actual worker behavior.
Validate datastore writes — Check whether writes correspond to legitimate job IDs.
Recommend fixes — Provide prioritized architectural corrections.
Produce a structured debugging report with root cause, contributing factors and remediation.`
  assert.equal(classifyCosSoftwareDelivery(prompt), 'analysis')
  assert.equal(isConciergeBuilderObjective(prompt), false)
})

test('explicit code repairs remain Builder requests', () => {
  for (const prompt of [
    'Debug this script: function login(){ throw new Error("broken") }',
    'My login form is broken, fix it. Source: src/login.ts',
    'Fix this worker script in src/worker.js and run npm test',
  ]) {
    assert.equal(isConciergeBuilderObjective(prompt), true, prompt)
  }
})

test('analysis with code snippets should not execute', () => {
  const prompt = 'Explain what is wrong with src/login.ts and recommend fixes.\n\`\`\`js\nconst ok = false\n\`\`\`'
  assert.equal(classifyCosSoftwareDelivery(prompt), 'analysis')
  assert.equal(isConciergeBuilderObjective(prompt), false)
})

test('hybrid investigation and repair keeps Builder', () => {
  const prompt = 'Investigate the race condition and fix the worker in src/worker.js. Explain the changes.'
  assert.equal(classifyCosSoftwareDelivery(prompt), 'hybrid')
  assert.equal(isConciergeBuilderObjective(prompt), true)
})

test('genuine application build keeps Builder', () => {
  const prompt = 'Build a Node.js application with package.json, src/index.js and npm test.'
  assert.equal(classifyCosSoftwareDelivery(prompt), 'build')
  assert.equal(isConciergeBuilderObjective(prompt), true)
})


test('explicit run-and-repair certification preserves Builder routing', () => {
  const prompt = 'Run: node report.js — it fails. Observe the actual failure, diagnose it from the recorded output rather than guessing, correct the cause, and prove recovery by running the same command again until it succeeds and prints the report line.'
  assert.equal(isConciergeBuilderObjective(prompt), true)
})

test('isolated repository acceptance stays executable despite report vocabulary', () => {
  const prompt = `Run a real, isolated end-to-end Builder acceptance test.
Use Builder V2 and the configured approved models.
Create an isolated Node.js repository with:
- sum.js exporting sum(a,b) but deliberately implemented as a - b.
- sum.test.js using node:test.
Acceptance sequence:
1. Run node --test sum.test.js and record the actual failure.
2. Inspect and repair only sum.js.
3. Commit the repair and open a PR against the isolated test branch.
4. Report PASS only after every step is verified.`
  assert.equal(isConciergeBuilderObjective(prompt), true)
})


test('acceptance campaign instructions and embedded test commands are not Builder authorization', () => {
  const prompt = [
    '# iTMounts / COS — Production Acceptance Campaign',
    'Campaign ID: COS-PAC-001',
    'Goal: verify actual COS analysis, tests, observability, and browser History.',
    'Review the campaign and report PASS / FAIL evidence for each verification.',
    'Primary forensic reasoning test — identify ranked hypotheses and missing evidence.',
    'PAC-18 Builder V2 integration fixture (not authorization to build this campaign).',
    'Test command in fixture: run: node --test test/*.test.js',
    'A disposable repository is part of a test case, not the requested output.',
  ].join('\n')
  assert.equal(classifyCosSoftwareDelivery(prompt), 'analysis')
  assert.equal(isConciergeBuilderObjective(prompt), false)
})

test('an affirmative runnable software repair still routes to Builder', () => {
  const prompt = 'Fix the broken project in src/index.js and execute run: node --test test/index.test.js'
  assert.equal(isConciergeBuilderObjective(prompt), true)
})
