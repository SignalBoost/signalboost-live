import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  fetchHuggingFaceJobLogTail,
  parseHuggingFaceJobLogSse,
} from '../lib/ai/cos/cosUniversityHuggingFaceJobDiagnostics.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

test('HF terminal diagnostics parse SSE and redact credential-like material', () => {
  const raw = [
    'data: {"data":"starting worker"}',
    'data: {"data":"HF_TOKEN=hf_supersecretvalue123456789 failed"}',
    'data: {"data":"RuntimeError: worker failed"}',
    '',
  ].join('\n')
  assert.deepEqual(parseHuggingFaceJobLogSse(raw, 40), [
    'starting worker',
    'HF_TOKEN=[redacted] failed',
    'RuntimeError: worker failed',
  ])
})

test('HF job logs use the documented read-only jobs log endpoint', async () => {
  let url = ''
  let authorization = ''
  const lines = await fetchHuggingFaceJobLogTail({
    namespace: 'cadomos',
    jobId: '6aa820035527934177edea5c',
    token: `hf_${'x'.repeat(48)}`,
    limit: 20,
    fetchImpl: async (candidate, init) => {
      url = candidate
      authorization = String((init?.headers as Record<string, string>)?.authorization || '')
      assert.equal(init?.method, undefined)
      return new Response('data: {"data":"worker error line"}\n', { status: 200 })
    },
  })
  assert.equal(url, 'https://huggingface.co/api/jobs/cadomos/6aa820035527934177edea5c/logs?tail=20')
  assert.match(authorization, /^Bearer hf_/)
  assert.deepEqual(lines, ['worker error line'])
})

test('mass cron reconciles, diagnoses, then considers new paid dispatch', () => {
  const workflow = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'), 'utf8')
  const reconcileAt = workflow.indexOf('await reconcileMassDistillationHuggingFaceProviderLedger({ now, maxJobs: 15 })')
  const diagnoseAt = workflow.indexOf('await diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 5 })')
  const consumeAt = workflow.indexOf('await runMassDistillationCampaignConsumer({ now, maxDispatches: 3 })')
  assert.ok(reconcileAt >= 0 && diagnoseAt > reconcileAt && consumeAt > diagnoseAt)
})

test('diagnostic helper is read-only and never cancels or re-arms jobs', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityHuggingFaceJobDiagnostics.ts'), 'utf8')
  assert.match(source, /\/logs\?tail=/)
  assert.match(source, /readOnlyProviderInspection:\s*true/)
  assert.match(source, /automaticRetryAuthorized:\s*false/)
  assert.doesNotMatch(source, /method:\s*['"]POST['"]|method:\s*['"]DELETE['"]|teacher_pending|runpod/i)
})
