import assert from 'node:assert/strict'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

process.env.VAULT_MASTER_KEY = 'a'.repeat(64)
const { openCustomerCredential, sealCustomerCredential } = await import('../lib/ai/cos/labCustomerCredentialVault.ts')
const { customerTeacherDefinition, unsupportedSelection, LAB_PROVIDER_CATALOG } = await import('../lib/ai/cos/labCustomerProviderCatalog.ts')
const lab = await import('../lib/ai/cos/labCustomerTraining.ts')
const { buildHuggingFaceJobSpec } = await import('../lib/ai/cos/cosUniversityHuggingFaceJobs.ts')

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const ORG_A = randomUUID(), ORG_B = randomUUID(), CRED = randomUUID()
const HF_TOKEN = 'hf_' + 'x'.repeat(30)

test('a sealed key opens only for its own organization and its own credential row', () => {
  const sealed = sealCustomerCredential({ organizationId: ORG_A, credentialId: CRED, secret: HF_TOKEN })
  assert.equal(openCustomerCredential({ organizationId: ORG_A, credentialId: CRED, sealed }), HF_TOKEN)
  assert.throws(() => openCustomerCredential({ organizationId: ORG_B, credentialId: CRED, sealed }), /lab_credential_unavailable/)
  assert.throws(() => openCustomerCredential({ organizationId: ORG_A, credentialId: randomUUID(), sealed }), /lab_credential_unavailable/)
  const tampered = { ...sealed, ciphertext: Buffer.from('y'.repeat(40)).toString('base64') }
  assert.throws(() => openCustomerCredential({ organizationId: ORG_A, credentialId: CRED, sealed: tampered }), /lab_credential_unavailable/)
  assert.ok(!sealed.ciphertext.includes(HF_TOKEN))
})

test('Supervisor, self-healing and platform University code never import the customer key vault', () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) { if (name !== 'node_modules') walk(path); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (readFileSync(path, 'utf8').includes('labCustomerCredentialVault')) offenders.push(path)
    }
  }
  for (const dir of ['lib/supervisor', 'self-healing-host', 'platform-harness', 'lib/cos-core']) walk(new URL(`../${dir}`, import.meta.url).pathname)
  assert.deepEqual(offenders, [])
})

test('the database migration gives no role direct access and no service-role path to keys except a stage token', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261012000000_lab_customer_provider_credentials_and_training.sql', import.meta.url), 'utf8')
  assert.match(sql, /revoke all on lab\.provider_credentials from public, anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /grant [^;]* on lab\.provider_credentials/i)
  // Every customer function uses the customer's own session and refuses the service role.
  for (const fn of ['store_credential', 'list_credentials', 'revoke_credential', 'create_training_run', 'open_run_compute', 'record_stage']) {
    assert.match(sql, new RegExp(`itmounts_lab_customer_${fn}[\\s\\S]*?lab\\.customer_session_user\\(\\)`))
    assert.match(sql, new RegExp(`revoke all on function public\\.itmounts_lab_customer_${fn}\\([^)]*\\) from public, anon, service_role`))
  }
  assert.match(sql, /jwt_role <> 'authenticated'/)
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /graduat|residency|certif/i)
})

test('provider-neutral catalog: any teacher, Hugging Face training, unsupported training named clearly', () => {
  assert.deepEqual(LAB_PROVIDER_CATALOG.filter(p => p.supports['training.execute']).map(p => p.kind), ['huggingface'])
  const problems = unsupportedSelection({ teacherKind: 'anthropic', computeKind: 'anthropic', baseModel: 'Qwen/Qwen2.5-0.5B-Instruct', promptCount: 30 })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /Anthropic does not offer customer training/)
  assert.deepEqual(unsupportedSelection({ teacherKind: 'openai', computeKind: 'huggingface', baseModel: 'Qwen/Qwen2.5-0.5B-Instruct', promptCount: 30 }), [])
  const def = customerTeacherDefinition({ kind: 'openai_compatible', model: 'm', endpoint: 'https://x.example/v1/chat/completions' })
  assert.equal(def.transport, 'openai_compatible')
  assert.throws(() => customerTeacherDefinition({ kind: 'openai_compatible', model: 'm', endpoint: null }), /endpoint_required/)
})

const prompts = Array.from({ length: 24 }, (_, i) => `Question ${i}: explain topic ${i}.`)
async function rows() {
  return lab.buildCustomerTeacherRows({ teacher: { id: 't', provider: 'openai', model: 'gpt' }, prompts, generate: async p => `Answer to ${p}` })
}

test('teacher rows and the preparation envelope are accepted by the existing Hugging Face job builder', async () => {
  const built = await rows()
  assert.equal(built.rows.length, 24)
  for (const row of built.rows) assert.equal(sha(row.text), row.itemHash)
  const runId = randomUUID()
  const envelope = lab.buildPrepareEnvelope({ runId, rows: built.rows, baseModel: 'Qwen/Qwen2.5-0.5B-Instruct', baseModelRevision: null, datasetHash: built.datasetHash })
  const token = lab.newStageToken()
  const spec = buildHuggingFaceJobSpec({
    envelope: envelope as any, callbackUrl: `https://app.example${lab.LAB_CUSTOMER_CALLBACK_PREFIX}/${token.token}`,
    idempotencyKey: 'k', callbackSecret: lab.stageCallbackSecret(runId, token.token),
    config: { token: HF_TOKEN, workerUrl: 'https://app.example/w.py', preparationFlavor: 'cpu-upgrade', teacherFlavor: 't4-small', trainingFlavor: 't4-small', preparationTimeoutSeconds: 1800, teacherTimeoutSeconds: 1800, trainingTimeoutSeconds: 14400, maxDatasetItems: 5000, maxHourlyCostUsd: 1 },
  })
  assert.equal(spec.secrets.HF_TOKEN, HF_TOKEN)
  assert.equal(spec.flavor, 'cpu-upgrade')
})

test('a teacher that fails some prompts still yields only valid rows', async () => {
  let n = 0
  const built = await lab.buildCustomerTeacherRows({ teacher: { id: 't', provider: 'p', model: 'm' }, prompts, generate: async p => { if (n++ % 3 === 0) throw new Error('429'); return `A ${p}` } })
  assert.equal(built.failures, 8)
  assert.equal(built.rows.length, 16)
})

test('worker callback signature matches the Python worker and expires', () => {
  const runId = randomUUID(); const { token } = lab.newStageToken()
  const secret = lab.stageCallbackSecret(runId, token)
  const timestamp = new Date().toISOString(); const raw = '{"claim":"x"}'
  const signature = createHmac('sha256', secret).update([timestamp, 'key', raw].join('\n')).digest('hex')
  assert.ok(lab.verifyWorkerCallback({ secret, timestamp, idempotencyKey: 'key', rawBody: raw, signature }))
  assert.ok(!lab.verifyWorkerCallback({ secret, timestamp, idempotencyKey: 'key', rawBody: raw + ' ', signature }))
  assert.ok(!lab.verifyWorkerCallback({ secret: lab.stageCallbackSecret(randomUUID(), token), timestamp, idempotencyKey: 'key', rawBody: raw, signature }))
  assert.ok(!lab.verifyWorkerCallback({ secret, timestamp, idempotencyKey: 'key', rawBody: raw, signature, now: Date.now() + 3_600_000 }))
})

test('dataset callback starts training in the customer account; foreign accounts and wrong stages are rejected', () => {
  const runId = randomUUID()
  const run = { runId, organizationId: ORG_A, stage: 'preparing_dataset', baseModel: 'Qwen/Q', baseModelRevision: null, datasetHash: 'd'.repeat(64), hfNamespace: 'acme' }
  const train = Array.from({ length: 10 }, (_, i) => sha(`t${i}`)); const hold = [sha('h1'), sha('h2')]
  const payload = { claim: 'partition_manifests_registered', candidateId: `lab-${runId}`, datasetHash: 'd'.repeat(64), trainingItemHashes: train, holdoutItemHashes: hold,
    trainingDataRef: 'hf://datasets/acme/itmounts-training-abc@123abc#train', holdoutDataRef: 'hf://datasets/acme/itmounts-training-abc@123abc#holdout' }
  const decision = lab.interpretWorkerCallback(run, payload)
  assert.equal(decision.kind, 'start_training')
  if (decision.kind === 'start_training') {
    assert.equal(decision.train.revision.trainingManifestHash, lab.manifestHash(train))
    assert.equal(decision.train.trainingMode, 'fine_tune')
  }
  assert.deepEqual(lab.interpretWorkerCallback(run, { ...payload, trainingDataRef: 'hf://datasets/evil/x@1#train' }), { kind: 'reject', reason: 'dataset_outside_customer_account' })
  assert.deepEqual(lab.interpretWorkerCallback({ ...run, stage: 'training' }, payload), { kind: 'reject', reason: 'stage_conflict' })
  assert.deepEqual(lab.interpretWorkerCallback(run, { ...payload, candidateId: 'lab-other' }), { kind: 'reject', reason: 'candidate_mismatch' })
})

test('model callback completes the run only for a pinned model in the customer account', () => {
  const runId = randomUUID()
  const run = { runId, organizationId: ORG_A, stage: 'training', baseModel: 'Qwen/Q', baseModelRevision: null, datasetHash: 'd'.repeat(64), hfNamespace: 'acme' }
  const ok = lab.interpretWorkerCallback(run, { claim: 'trained_artifact_registered', candidateId: `lab-${runId}`, evidenceRef: 'hf://models/acme/itmounts-student-pool-00@abc123', artifactHash: 'e'.repeat(64) })
  assert.deepEqual(ok, { kind: 'complete', patch: { artifactRepo: 'acme/itmounts-student-pool-00', artifactRevision: 'abc123', artifactHash: 'e'.repeat(64) } })
  assert.equal(lab.interpretWorkerCallback(run, { claim: 'trained_artifact_registered', candidateId: `lab-${runId}`, evidenceRef: 'hf://models/other/x@1', artifactHash: 'e'.repeat(64) }).kind, 'reject')
})

test('failed provider jobs are reported with the worker error code', () => {
  const verdict = lab.interpretJobStage('ERROR', 'boom\nitmounts_hf_worker_error:RuntimeError:worker_dataset_too_small\n')
  assert.deepEqual(verdict.failed, true); assert.equal(verdict.failureCode, 'worker_dataset_too_small')
  assert.equal(lab.interpretJobStage('RUNNING', '').failed, false)
})
