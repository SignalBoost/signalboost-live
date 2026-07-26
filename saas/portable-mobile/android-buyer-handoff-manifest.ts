export const ANDROID_BUYER_HANDOFF_MANIFEST_SCHEMA_VERSION = 'signalboost-android-buyer-handoff-manifest-v1' as const

export type AndroidBuyerHandoffBlocker = 'evidence-chain' | 'identity' | 'references' | 'timestamps' | 'acknowledgments' | 'unsafe-state'

type Value = Record<string, unknown>
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const VERSION_NAME = /^[0-9]+(?:\.[0-9]+){1,3}(?:-[A-Za-z0-9.-]+)?$/
const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const CREDENTIAL_PARAMETER = /(?:^|[?&#;])(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret|token|bearer)=/i
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|password|secret=|token=|bearer\s|client_email|private_key|%61%70%69(?:_|%5f)?%6b%65%79/i
const PHASES = ['readiness', 'build-evidence', 'signed-bundle-evidence', 'release-evidence', 'publication-evidence', 'production-publication-evidence'] as const

function record(value: unknown): Value | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Value : null
}

function validReference(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || !REFERENCE.test(value) || value.includes('..') || value.includes('@')) return false
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { return false }
  return !UNSAFE.test(value) && !UNSAFE.test(decoded) && !CREDENTIAL_PARAMETER.test(value) && !CREDENTIAL_PARAMETER.test(decoded)
}

function date(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validChainReport(chain: Value | null): boolean {
  if (!chain || chain.schemaVersion !== 'signalboost-android-packaging-evidence-chain-v1' || chain.state !== 'packaging_evidence_chain_validated') return false
  if (!Array.isArray(chain.blockers) || chain.blockers.length !== 0 || !Array.isArray(chain.phases) || chain.phases.length !== PHASES.length || chain.phases.some((phase, index) => phase !== PHASES[index])) return false
  if (typeof chain.portableId !== 'string' || !chain.portableId || chain.packageName !== 'com.signalboost.providerhub') return false
  if (typeof chain.sourceCommitSha !== 'string' || !SHA40.test(chain.sourceCommitSha)) return false
  if (typeof chain.unsignedAabSha256 !== 'string' || !SHA256.test(chain.unsignedAabSha256) || typeof chain.signedAabSha256 !== 'string' || !SHA256.test(chain.signedAabSha256)) return false
  if (!Number.isSafeInteger(chain.versionCode) || Number(chain.versionCode) <= 0 || typeof chain.versionName !== 'string' || !VERSION_NAME.test(chain.versionName)) return false
  return chain.readOnly === true && chain.artifactAccessed === false && chain.playApiInvoked === false && chain.storeMutationPerformed === false && chain.productionExecutionEnabled === false
}

export function validateAndroidBuyerHandoffManifest(inputValue: unknown) {
  const input = record(inputValue)
  const chain = record(input?.evidenceChain)
  const blockers: AndroidBuyerHandoffBlocker[] = []
  const validChain = validChainReport(chain)
  if (!validChain) blockers.push('evidence-chain')

  const portableId = typeof input?.portableId === 'string' ? input.portableId.trim() : ''
  const packageName = typeof input?.packageName === 'string' ? input.packageName.trim() : ''
  if (!portableId || !packageName || portableId !== chain?.portableId || packageName !== chain?.packageName) blockers.push('identity')

  const buyer = input?.buyerReference
  const transfer = input?.transferReference
  const support = input?.supportReference
  if (!validReference(buyer) || !validReference(transfer) || !validReference(support)) blockers.push('references')

  const prepared = date(input?.preparedAt)
  const acknowledged = date(input?.acknowledgedAt)
  if (prepared === null || acknowledged === null || acknowledged < prepared) blockers.push('timestamps')
  if (input?.buyerControlsSigningKeys !== true || input?.buyerControlsPlayConsole !== true || input?.buyerAcceptsExternalPublicationResponsibility !== true) blockers.push('acknowledgments')
  if (input?.credentialsTransferred !== false || input?.artifactAccessed !== false || input?.playApiInvoked !== false || input?.storeMutationPerformed !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_BUYER_HANDOFF_MANIFEST_SCHEMA_VERSION,
    portableId,
    packageName,
    sourceCommitSha: validChain ? String(chain?.sourceCommitSha) : '',
    unsignedAabSha256: validChain ? String(chain?.unsignedAabSha256) : '',
    signedAabSha256: validChain ? String(chain?.signedAabSha256) : '',
    versionCode: validChain ? Number(chain?.versionCode) : 0,
    versionName: validChain ? String(chain?.versionName) : '',
    state: blockers.length === 0 ? 'buyer_handoff_manifest_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    externalResponsibilities: Object.freeze(['signing-key-custody', 'play-console-access', 'aab-upload', 'review-response', 'rollout-control', 'store-publication', 'live-store-verification']),
    references: Object.freeze({ buyer: validReference(buyer) ? buyer : '', transfer: validReference(transfer) ? transfer : '', support: validReference(support) ? support : '' }),
    readOnly: true,
    credentialsTransferred: false,
    artifactAccessed: false,
    playApiInvoked: false,
    storeMutationPerformed: false,
    productionExecutionEnabled: false,
  })
}
