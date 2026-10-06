import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { resolveLabFailureAttribution, type LabFailureAttribution } from './cosLabFailureAttribution.ts'

export type SignedLabFailureVerdict = Readonly<{
  jobId: string
  providerStage: string
  verdict: Exclude<LabFailureAttribution, 'UNATTRIBUTED'>
  verifierId: string
  evidenceRef: string
  evidenceHash: string
  issuedAt: string
  signatureBase64: string
}>

const SHA256 = /^[a-f0-9]{64}$/i
export const LAB_FAILURE_VERDICT_MAX_AGE_MS = 5 * 60_000
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** The trust store must be configured by the server, never supplied by the experiment submitter. */
export function verifySignedLabFailureVerdict(input: {
  verdict: SignedLabFailureVerdict
  expectedJobId: string
  expectedProviderStage: string
  trustedVerifierKeys: Readonly<Record<string, string>>
  now?: Date
}): LabFailureAttribution {
  const v = input.verdict
  if (!v || v.jobId !== input.expectedJobId || v.providerStage !== input.expectedProviderStage) return 'UNATTRIBUTED'
  if (!v.jobId || !v.verifierId || !v.evidenceRef || !SHA256.test(v.evidenceHash)) return 'UNATTRIBUTED'
  const issuedAt = Date.parse(v.issuedAt)
  const now = (input.now ?? new Date()).getTime()
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v.issuedAt) || !Number.isFinite(issuedAt) || !Number.isFinite(now)) return 'UNATTRIBUTED'
  if (issuedAt > now + 60_000 || now - issuedAt > LAB_FAILURE_VERDICT_MAX_AGE_MS) return 'UNATTRIBUTED'
  const keyPem = Object.hasOwn(input.trustedVerifierKeys, v.verifierId) ? input.trustedVerifierKeys[v.verifierId] : undefined
  if (!keyPem || !BASE64.test(v.signatureBase64)) return 'UNATTRIBUTED'
  try {
    const key = createPublicKey(keyPem)
    if (key.asymmetricKeyType !== 'ed25519') return 'UNATTRIBUTED'
    const payload = JSON.stringify([v.jobId, v.providerStage, v.verdict, v.verifierId, v.evidenceRef, v.evidenceHash.toLowerCase(), v.issuedAt])
    const signature = Buffer.from(v.signatureBase64, 'base64')
    if (!verifySignature(null, Buffer.from(payload, 'utf8'), key, signature)) return 'UNATTRIBUTED'
    return resolveLabFailureAttribution({ providerStage: v.providerStage, verification: {
      verdict: v.verdict, verifierId: v.verifierId, evidenceRef: v.evidenceRef,
      evidenceHash: v.evidenceHash, independentlyVerified: true,
    } })
  } catch { return 'UNATTRIBUTED' }
}
