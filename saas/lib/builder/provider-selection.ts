/** Explicit capability selection: a connected Cursor provider is only available to owner
 * repository jobs. Customer BYOI workspace content is never sent to Cursor implicitly.
 */
export type BuilderExecutionProvider = 'internal-v2' | 'cursor-cloud'
export function selectBuilderExecutionProvider(input: {
  metadata: Readonly<Record<string, unknown>>
  ownerAuthorized: boolean
  jobKind: string
  cursorCredentialConfigured: boolean
}): { provider: BuilderExecutionProvider; reason: string } {
  if (input.metadata.builderProvider !== 'cursor-cloud')
    return {provider:'internal-v2',reason:'default'}
  if (input.jobKind !== 'standard' || !input.ownerAuthorized)
    return {provider:'internal-v2',reason:'cursor_requires_owner_standard_job'}
  if (input.metadata.platformRepair !== true ||
      input.metadata.cursorRepository !== 'SignalBoost/signalboost-live')
    return {provider:'internal-v2',reason:'cursor_repository_consent_required'}
  if (!input.cursorCredentialConfigured)
    return {provider:'internal-v2',reason:'cursor_credential_missing'}
  return {provider:'cursor-cloud',reason:'explicit_owner_repository_provider'}
}
