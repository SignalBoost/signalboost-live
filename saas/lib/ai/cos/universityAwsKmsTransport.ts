// Production transport adapter for AWS KMS Ed25519 issuance.
// Uses the AWS SDK default credential chain (prefer workload IAM role).
// Does not accept private keys or grant signing authority.
import type { Ed25519KmsClient } from './universityAwsKmsEd25519Signer.ts'

type KmsSdk = {
  KMSClient: new (config: { region: string }) => { send(command: unknown): Promise<any> }
  DescribeKeyCommand: new (input: { KeyId: string }) => unknown
  GetPublicKeyCommand: new (input: { KeyId: string }) => unknown
  SignCommand: new (input: {
    KeyId: string; Message: Uint8Array; MessageType: 'RAW'; SigningAlgorithm: 'ED25519_SHA_512'
  }) => unknown
}

export function createUniversityAwsKmsTransport(input: Readonly<{
  region: string
  keyArn: string
  sdk: KmsSdk
}>): Ed25519KmsClient {
  if (!input.region || !input.keyArn.startsWith('arn:aws')) throw new Error('kms_configuration_invalid')
  const client = new input.sdk.KMSClient({ region: input.region })
  return {
    describeKey: async keyId => {
      if (keyId !== input.keyArn) throw new Error('kms_key_mismatch')
      return client.send(new input.sdk.DescribeKeyCommand({ KeyId: input.keyArn }))
    },
    getPublicKey: async keyId => {
      if (keyId !== input.keyArn) throw new Error('kms_key_mismatch')
      return client.send(new input.sdk.GetPublicKeyCommand({ KeyId: input.keyArn }))
    },
    sign: async request => {
      if (request.KeyId !== input.keyArn || request.MessageType !== 'RAW'
        || request.SigningAlgorithm !== 'ED25519_SHA_512') throw new Error('kms_request_denied')
      return client.send(new input.sdk.SignCommand(request))
    },
  }
}
