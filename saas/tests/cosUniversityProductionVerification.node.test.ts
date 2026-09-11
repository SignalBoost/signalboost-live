import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { COS_UNIVERSITY_FEATURE_GATED_PATHS } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'
import { evaluateCosUniversityProductionVerification, type ProductionPathEventRow } from '../lib/ai/cos/cosUniversityProductionVerificationCore.ts'

const now = new Date('2026-09-10T12:00:00Z')
const commitSha = 'a'.repeat(40)
const deploymentId = 'dpl_current'

function rows(): ProductionPathEventRow[] {
  return Object.keys(COS_UNIVERSITY_FEATURE_GATED_PATHS).map((path, index) => ({
    event_key: `event-${index}`, path_id: path, deployment_id: deploymentId, commit_sha: commitSha,
    evidence: { featureEnabled: true, invocationSucceeded: true, runnerInvoked: true, attempted: 1,
      status: 'passed', passed: true, runs: [{ runId: `test-${path}`, status: 'passed', passed: true }] }, verifier: 'host_production_verifier',
    observed_at: '2026-09-10T11:00:00Z', expires_at: '2026-09-11T11:00:00Z',
  }))
}

test('all declared paths require fresh successful receipts from the exact Production deployment', () => {
  const complete = evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: rows() })
  assert.equal(complete.verified, true)
  assert.deepEqual(complete.missingOrInvalid, [])

  const incomplete = rows()
  incomplete[0] = { ...incomplete[0], deployment_id: 'dpl_old' }
  incomplete[1] = { ...incomplete[1], evidence: { featureEnabled: false, invocationSucceeded: true } }
  incomplete[2] = { ...incomplete[2], expires_at: '2026-09-10T10:00:00Z' }
  const result = evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: incomplete })
  assert.equal(result.verified, false)
  assert.deepEqual(result.missingOrInvalid, result.paths.slice(0, 3).map(item => item.path))
})

test('owner-only GET exposes read-only fail-closed assurance status', () => {
  const route = fs.readFileSync(path.resolve(import.meta.dirname, '../app/api/admin/cos-university-assurance/route.ts'), 'utf8')
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
  assert.match(get, /requireOwner\(\)/)
  assert.match(get, /readCosUniversityProductionVerification\(\)/)
  assert.match(get, /verified: false/)
  assert.doesNotMatch(get, /recordFineTuneHostApproval|\.(insert|upsert|update|delete)\(/)
  assert.match(route, /\['dataset_approved', 'training_approved'\]/, 'separate owner approvals remain supported')
})
