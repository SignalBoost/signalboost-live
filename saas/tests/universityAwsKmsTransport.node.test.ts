import assert from 'node:assert/strict'
import test from 'node:test'
import { createUniversityAwsKmsTransport } from '../lib/ai/cos/universityAwsKmsTransport.ts'

test('KMS transport pins key and Ed25519 signing request', async () => {
  const inputs: any[] = []
  const sdk: any = {
    KMSClient: class { async send(cmd: any) { inputs.push(cmd); return { KeyMetadata: { KeySpec: 'ECC_NIST_EDWARDS25519' } } } },
    DescribeKeyCommand: class { readonly input: any; constructor(input: any) { this.input = input } },
    GetPublicKeyCommand: class { readonly input: any; constructor(input: any) { this.input = input } },
    SignCommand: class { readonly input: any; constructor(input: any) { this.input = input } },
  }
  const arn = 'arn:aws:kms:us-east-1:123456789012:key/test-only'
  const transport = createUniversityAwsKmsTransport({ sdk, region: 'us-east-1', keyArn: arn })
  await assert.rejects(() => transport.describeKey('attacker-key'), /kms_key_mismatch/)
  await assert.rejects(() => transport.sign({ KeyId: 'attacker-key', Message: new Uint8Array(2), MessageType: 'RAW', SigningAlgorithm: 'ED25519_SHA_512' }), /kms_request_denied/)
  assert.equal(inputs.length, 0)
  await transport.sign({ KeyId: arn, Message: new Uint8Array(2), MessageType: 'RAW', SigningAlgorithm: 'ED25519_SHA_512' })
  assert.equal(inputs[0].input.KeyId, arn)
  assert.equal(inputs[0].input.MessageType, 'RAW')
})
