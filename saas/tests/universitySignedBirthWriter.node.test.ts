import assert from 'node:assert/strict'
import test from 'node:test'
import { createUniversitySignedBirthInsertOnce } from '../lib/ai/cos/universitySignedBirthWriter.ts'

const row: any = {
  permanent_artifact_id: '22222222-2222-4222-8222-222222222222',
  vin: 'AI-' + 'a'.repeat(64),
  algorithm: 'ed25519', issuer_fingerprint: 'b'.repeat(64),
  issuer_public_key_pem: 'pinned-public-key', signature_base64: 'signed',
}

test('writes exactly one service-role insert and never upserts', async () => {
  let writes = 0
  const insertOnce = createUniversitySignedBirthInsertOnce({
    from(table: string) {
      assert.equal(table, 'cos_university_signed_birth_envelopes')
      return { insert: async (value: any) => {
        writes++
        assert.equal(value, row)
        return { error: null }
      } }
    },
  })
  assert.equal(await insertOnce(row), true)
  assert.equal(writes, 1)
})

test('rejects malformed and conflicting envelopes without mutation or overwrite', async () => {
  let writes = 0
  const insertOnce = createUniversitySignedBirthInsertOnce({
    from() { return { insert: async () => { writes++; return { error: { code: '23505' } } } } },
  })
  assert.equal(await insertOnce({ ...row, vin: 'INVALID' }), false)
  assert.equal(writes, 0)
  assert.equal(await insertOnce(row), false)
  assert.equal(writes, 1)
})
