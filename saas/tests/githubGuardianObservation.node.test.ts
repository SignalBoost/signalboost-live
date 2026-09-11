import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { materializeGuardianRepositoryObservation } from '../lib/security/github-guardian-observation.ts'

const evidence = (paths: string[]) => ({
  hash: 'a'.repeat(64),
  event: {
    eventId: 'github:delivery-1',
    recordedAt: '2026-09-11T02:43:30.000Z',
    target: { kind: 'repository', value: 'SignalBoost/signalboost-live' },
    observations: [
      { kind: 'repository_event_type', value: 'repository.push' },
      { kind: 'provider_reported_actor', value: 'SignalBoost' },
      { kind: 'repository_ref', value: 'refs/heads/main' },
      { kind: 'commit_sha', value: 'b'.repeat(40) },
      ...paths.map(value => ({ kind: 'changed_path', value })),
    ],
  },
})

test('materializes authenticated benign activity without fabricating an alert', () => {
  const result = materializeGuardianRepositoryObservation({ organizationId: '271401395', workItemId: 'work-1', deliveryId: 'delivery-1', evidenceEntry: evidence(['docs/readme.md']) })
  assert.equal(result.observation.verification_status, 'verified')
  assert.equal(result.observation.trigger_source, 'webhook')
  assert.equal(result.observation.severity, 'info')
  assert.equal(result.alert, null)
})

test('opens a bounded review alert for security-sensitive paths without asserting compromise', () => {
  const result = materializeGuardianRepositoryObservation({ organizationId: '271401395', workItemId: 'work-2', deliveryId: 'delivery-2', evidenceEntry: evidence(['saas/app/api/webhook/github/route.ts', '.github/main-write-token']) })
  assert.equal(result.observation.severity, 'medium')
  assert.deepEqual((result.observation.safe_metadata as any).sensitivePaths, ['.github/main-write-token', 'saas/app/api/webhook/github/route.ts'])
  assert.equal(result.alert?.advisory_id, 'guardian-repository-change:delivery-2')
  assert.match(String(result.alert?.message), /not an attribution or vulnerability finding/)
})

test('Production cron is scheduled and claims webhook backlog through fenced coordination', () => {
  const cron = readFileSync(new URL('../app/api/cron/github-observation/route.ts', import.meta.url), 'utf8')
  const webhook = readFileSync(new URL('../security-host/github-webhook.ts', import.meta.url), 'utf8')
  const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(cron, /listAvailableWork\(\{ provider: 'github'/)
  assert.match(cron, /acquireLease/)
  assert.match(cron, /from: 'processing', to: 'completed'/)
  assert.match(cron, /github_normalized_observations/)
  assert.match(cron, /guardian_repository_observation_completed/)
  assert.match(cron, /no_patrol_observation_required/)
  assert.match(cron, /guardian_delivery_completion_failed/)
  assert.doesNotMatch(webhook, /paths\.length >= 100/)
  assert.match(webhook, /unique\.filter\(sensitive\)/)
  assert.match(vercel, /\/api\/cron\/github-observation/)
})
