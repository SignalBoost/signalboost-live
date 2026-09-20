// saas/tests/hfPinnedDatasetRevision.node.test.ts
//
// The mass evaluation lane stalled because the holdout pin was validated against the dataset repository's
// CURRENT head sha. Once that repository received any later commit, every artifact pinned before it failed
// with mass_distilled_evaluation_holdout_revision_moved on every retry — a permanent, deterministic failure
// that still consumed a rolling approval and a runtime wake each time.
//
// These tests pin the replacement contract: resolve the repository AT the pinned commit, treat only a 404 as
// the pin being gone, and never accept a response that carries a different commit than the one requested.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolvePinnedHfDatasetRevision } from '../lib/ai/cos/hfPinnedDatasetRevision.ts'

const REPO = 'itmounts/cos-university-holdout'
const REVISION = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const TOKEN = 'hf_' + 'x'.repeat(30)

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function recordingFetch(handler: (url: string) => Response) {
  const calls: string[] = []
  const impl = (async (input: any) => {
    const url = String(input instanceof URL ? input.href : input?.url || input)
    calls.push(url)
    return handler(url)
  }) as unknown as typeof fetch
  return { impl, calls }
}

test('resolves the repository at the pinned commit, not at HEAD', async () => {
  const { impl, calls } = recordingFetch(() => respond({
    sha: REVISION,
    siblings: [{ rfilename: 'holdout.parquet' }, { rfilename: 'README.md' }, { rfilename: '' }],
  }))

  const resolved = await resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: TOKEN, fetchImpl: impl })

  assert.equal(calls.length, 1)
  assert.equal(calls[0], `https://huggingface.co/api/datasets/${REPO}/revision/${REVISION}`)
  assert.equal(resolved.sha, REVISION)
  // Blank sibling entries are dropped; real ones survive in order for the parquet path matcher.
  assert.deepEqual(resolved.siblings.map(item => item.rfilename), ['holdout.parquet', 'README.md'])
})

test('a dataset whose HEAD has moved on is still resolvable at its pinned commit', async () => {
  // This is the exact production condition that stalled the lane. The registry answers for the pinned
  // commit while HEAD is elsewhere, and that must now be an ordinary success.
  const { impl } = recordingFetch(url => {
    assert.ok(url.endsWith(`/revision/${REVISION}`), 'must not ask for the default branch')
    return respond({ sha: REVISION, siblings: [{ rfilename: 'test-00000-of-00001.parquet' }] })
  })
  const resolved = await resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: TOKEN, fetchImpl: impl })
  assert.equal(resolved.sha, REVISION)
})

test('a commit that no longer resolves is named distinctly from registry unavailability', async () => {
  const gone = recordingFetch(() => new Response('', { status: 404 }))
  await assert.rejects(
    resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: TOKEN, fetchImpl: gone.impl }),
    /^Error: hf_pinned_dataset_revision_missing$/,
  )

  for (const status of [401, 403, 429, 500, 502, 503]) {
    const failing = recordingFetch(() => new Response('', { status }))
    await assert.rejects(
      resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: TOKEN, fetchImpl: failing.impl }),
      new RegExp(`^Error: hf_pinned_dataset_revision_http_${status}$`),
    )
  }
})

test('a response carrying a different commit is rejected', async () => {
  const { impl } = recordingFetch(() => respond({ sha: OTHER, siblings: [] }))
  await assert.rejects(
    resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: TOKEN, fetchImpl: impl }),
    /^Error: hf_pinned_dataset_revision_mismatch$/,
  )
})

test('contract inputs are validated before any network call', async () => {
  const { impl, calls } = recordingFetch(() => respond({ sha: REVISION, siblings: [] }))

  await assert.rejects(
    resolvePinnedHfDatasetRevision({ repoId: 'no-owner', revision: REVISION, token: TOKEN, fetchImpl: impl }),
    /^Error: hf_pinned_dataset_repo_invalid$/,
  )
  await assert.rejects(
    resolvePinnedHfDatasetRevision({ repoId: REPO, revision: 'main', token: TOKEN, fetchImpl: impl }),
    /^Error: hf_pinned_dataset_revision_invalid$/,
  )
  await assert.rejects(
    resolvePinnedHfDatasetRevision({ repoId: REPO, revision: REVISION, token: 'short', fetchImpl: impl }),
    /^Error: hf_pinned_dataset_token_missing$/,
  )
  assert.equal(calls.length, 0)
})

test('the mass evaluator uses the pinned resolver and no longer requires the pin to be HEAD', () => {
  const evaluator = readFileSync(
    new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url),
    'utf8',
  )
  assert.match(evaluator, /resolvePinnedHfDatasetRevision/)
  assert.match(evaluator, /siblings:pinnedRevision\.siblings/)
  // The holdout must still be identity-checked against the pinned manifest — relaxing the pin check must
  // never relax what the evaluation is allowed to score.
  assert.match(evaluator, /manifestHash\(observed\) !== input\.expectedManifestHash/)
  assert.doesNotMatch(evaluator, /throw new Error\('mass_distilled_evaluation_holdout_revision_moved'\)/)
})
