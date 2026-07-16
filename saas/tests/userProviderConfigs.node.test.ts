import assert from 'node:assert/strict'
import test from 'node:test'

const originalVaultMasterKey = process.env.VAULT_MASTER_KEY

test('encrypts, masks, and decrypts provider keys without exposing plaintext in envelopes', async () => {
  process.env.VAULT_MASTER_KEY = 'a'.repeat(64)
  const { decryptProviderKeys, encryptProviderKeys, maskProviderKeys } = await import('../lib/engine/userProviderConfigs.ts')

  const encrypted = encryptProviderKeys({ apiKey: 'sk-test-12345' })

  assert.equal(typeof encrypted.apiKey.valueEncrypted, 'string')
  assert.notEqual(encrypted.apiKey.valueEncrypted, 'sk-test-12345')
  assert.equal(encrypted.apiKey.last4, '2345')
  assert.deepEqual(maskProviderKeys(encrypted), { apiKey: '••••2345' })
  assert.deepEqual(decryptProviderKeys(encrypted), { apiKey: 'sk-test-12345' })

  if (originalVaultMasterKey === undefined) delete process.env.VAULT_MASTER_KEY
  else process.env.VAULT_MASTER_KEY = originalVaultMasterKey
})
