import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261008024500_signed_artifact_birth_envelopes.sql', import.meta.url), 'utf8')

test('Phase 2 signed envelopes bind to immutable birth identity and exact hash lineage', () => {
  for (const field of ['trained_artifact_hash','revision_key','dataset_hash','parent_permanent_artifact_id']) {
    assert.match(sql, new RegExp('birth\\.' + field + ' is distinct from new\\.' + field))
  }
  assert.match(sql, /issuance_kind is distinct from 'native_birth'/)
  assert.match(sql, /signed_birth_identity_mismatch/)
  assert.match(sql, /before insert on public\.cos_university_signed_birth_envelopes/)
})
test('Phase 2 signature ledger is immutable, tenant-inaccessible by default and cannot mint authority', () => {
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on public\.cos_university_signed_birth_envelopes from public, anon, authenticated/)
  assert.match(sql, /grant select, insert on public\.cos_university_signed_birth_envelopes to service_role/)
  assert.match(sql, /before update or delete on public\.cos_university_signed_birth_envelopes/)
  assert.match(sql, /authority_expanded boolean not null default false check \(authority_expanded is false\)/)
})
test('Phase 2 uses external Ed25519 signature and never generates keys in SQL', () => {
  assert.match(sql, /algorithm text not null check \(algorithm = 'ed25519'\)/)
  assert.match(sql, /issuer_fingerprint text not null/)
  assert.doesNotMatch(sql, /private_key|pgp_sym_encrypt|gen_random_bytes/i)
  assert.doesNotMatch(sql, /update public\.cos_university_artifact_birth_certificates/i)
})
