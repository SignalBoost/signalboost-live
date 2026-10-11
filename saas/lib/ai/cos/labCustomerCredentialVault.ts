// Customer LAB provider credentials: seal for storage, open for ONE authorized execution.
//
// SECURITY BOUNDARY — this module must never be imported by Supervisor, self-healing, platform University or
// any operator tooling. tests/labCustomerTraining.node.test.ts fails the build if one of those trees imports it.
// The database only releases ciphertext to the signed-in customer's own request or to that run's worker callback
// (single-use stage token); see migration 20261012000000.
import { vaultDecryptScoped, vaultEncryptScoped } from '../../vault/crypto.ts'

export const LAB_CREDENTIAL_KINDS = ['huggingface', 'openai', 'anthropic', 'gemini', 'openai_compatible'] as const
export type LabCredentialKind = typeof LAB_CREDENTIAL_KINDS[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SealedCredential = Readonly<{ ciphertext: string; iv: string; tag: string }>

function scopeFor(organizationId: string): string {
  if (!UUID.test(organizationId)) throw new Error('lab_credential_scope_invalid')
  return `lab-org:${organizationId.toLowerCase()}`
}
function contextFor(organizationId: string, credentialId: string): string {
  if (!UUID.test(credentialId)) throw new Error('lab_credential_id_invalid')
  return `lab-provider-credential:v1|${organizationId.toLowerCase()}|${credentialId.toLowerCase()}`
}

export function sealCustomerCredential(input: { organizationId: string; credentialId: string; secret: string }): SealedCredential {
  const secret = String(input.secret ?? '').trim()
  if (secret.length < 20 || secret.length > 4096 || /\s/.test(secret)) throw new Error('lab_credential_value_invalid')
  const sealed = vaultEncryptScoped(secret, scopeFor(input.organizationId), contextFor(input.organizationId, input.credentialId))
  if (!sealed.ok || !sealed.valueEncrypted || !sealed.iv || !sealed.tag) throw new Error('lab_credential_vault_unavailable')
  return Object.freeze({ ciphertext: sealed.valueEncrypted, iv: sealed.iv, tag: sealed.tag })
}

export function openCustomerCredential(input: { organizationId: string; credentialId: string; sealed: SealedCredential }): string {
  const opened = vaultDecryptScoped(input.sealed.ciphertext, input.sealed.iv, input.sealed.tag,
    scopeFor(input.organizationId), contextFor(input.organizationId, input.credentialId))
  if (!opened.ok || !opened.value) throw new Error('lab_credential_unavailable')
  return opened.value
}
