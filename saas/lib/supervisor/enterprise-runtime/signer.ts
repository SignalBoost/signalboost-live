export interface HardwareSigner {
  readonly provider: string
  readonly keyId: string
  sign(payload: Uint8Array): Promise<Uint8Array>
}

export interface AwsKmsSignClient {
  sign(input: { keyId: string; message: Uint8Array; algorithm: 'RSASSA_PSS_SHA_256' | 'ECDSA_SHA_256' }): Promise<Uint8Array>
}

export class AwsKmsHardwareSigner implements HardwareSigner {
  readonly provider = 'aws-kms'
  constructor(readonly keyId: string, private readonly client: AwsKmsSignClient, private readonly algorithm: 'RSASSA_PSS_SHA_256' | 'ECDSA_SHA_256' = 'ECDSA_SHA_256') {}
  sign(payload: Uint8Array): Promise<Uint8Array> { return this.client.sign({ keyId: this.keyId, message: payload, algorithm: this.algorithm }) }
}

export interface AzureKeyVaultSignClient {
  sign(input: { keyId: string; digest: Uint8Array; algorithm: 'PS256' | 'ES256' }): Promise<Uint8Array>
}

export class AzureKeyVaultHardwareSigner implements HardwareSigner {
  readonly provider = 'azure-key-vault'
  constructor(readonly keyId: string, private readonly client: AzureKeyVaultSignClient, private readonly algorithm: 'PS256' | 'ES256' = 'ES256') {}
  sign(payload: Uint8Array): Promise<Uint8Array> { return this.client.sign({ keyId: this.keyId, digest: payload, algorithm: this.algorithm }) }
}

export interface GenericHsmSignClient { sign(keyId: string, payload: Uint8Array): Promise<Uint8Array> }
export class GenericHsmSigner implements HardwareSigner {
  readonly provider = 'hsm'
  constructor(readonly keyId: string, private readonly client: GenericHsmSignClient) {}
  sign(payload: Uint8Array): Promise<Uint8Array> { return this.client.sign(this.keyId, payload) }
}
