export const ANDROID_BUYER_HANDOFF_MANIFEST_SCHEMA_VERSION = 'signalboost-android-buyer-handoff-manifest-v1' as const

export type AndroidBuyerHandoffBlocker =
  | 'evidence-chain'
  | 'identity'
  | 'references'
  | 'timestamps'
  | 'acknowledgments'
  | 'unsafe-state'

export interface AndroidBuyerHandoffManifestReport {
  schemaVersion: typeof ANDROID_BUYER_HANDOFF_MANIFEST_SCHEMA_VERSION
  portableId: string
  packageName: string
  sourceCommitSha: string
  unsignedAabSha256: string
  signedAabSha256: string
  versionCode: number
  versionName: string
  state: 'buyer_handoff_manifest_validated' | 'blocked'
  blockers: readonly AndroidBuyerHandoffBlocker[]
  externalResponsibilities: readonly string[]
  references: Readonly<{ buyer: string; transfer: string; support: string }>
  readOnly: true
  credentialsTransferred: false
  artifactAccessed: false
  playApiInvoked: false
  storeMutationPerformed: false
  productionExecutionEnabled: false
}

type Value = Record<string, unknown>
const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|password|secret=|token=|bearer\s|client_email|private_key/i

function record(value: unknown): Value | null {
  return value !== null && typeof value === 'object' ? value as Value : null
}

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !value.includes('@') && !UNSAFE.test(value)
}

function date(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateAndroidBuyerHandoffManifest(inputValue: unknown): AndroidBuyerHandoffManifestReport {
  const input = record(inputValue)
  const chain = record(input?.evidenceChain)
  const blockers: AndroidBuyerHandoffBlocker[] = []
  const validChain = Boolean(
    chain && chain.schemaVersion === 'signalboost-android-packaging-evidence-chain-v1' &&
    chain.state === 'packaging_evidence_chain_validated' && Array.isArray(chain.blockers) && chain.blockers.length === 0 &&
    chain.readOnly === true && chain.artifactAccessed === false && chain.playApiInvoked === false &&
    chain.storeMutationPerformed === false && chain.productionExecutionEnabled === false,
  )
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
    sourceCommitSha: validChain ? String(chain?.sourceCommitSha ?? '') : '',
    unsignedAabSha256: validChain ? String(chain?.unsignedAabSha256 ?? '') : '',
    signedAabSha256: validChain ? String(chain?.signedAabSha256 ?? '') : '',
    versionCode: validChain && typeof chain?.versionCode === 'number' ? chain.versionCode : 0,
    versionName: validChain && typeof chain?.versionName === 'string' ? chain.versionName : '',
    state: blockers.length === 0 ? 'buyer_handoff_manifest_validated' : 'blocked',
    blockers: Object.freeze(blockers),
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
