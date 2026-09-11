type PatrolObservation = Readonly<{ kind?: unknown; value?: unknown }>

export type GuardianRepositoryObservation = Readonly<{
  observation: Readonly<Record<string, unknown>>
  alert: Readonly<Record<string, unknown>> | null
}>

const sensitivePath = (path: string) =>
  /^\.github\/(?:workflows\/|CODEOWNERS$|main-write-token$)/.test(path)
  || /(^|\/)security-host\//.test(path)
  || /(^|\/)supabase\/migrations\//.test(path)
  || /(^|\/)app\/api\/webhook\/github\/route\.ts$/.test(path)
  || /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)

export function materializeGuardianRepositoryObservation(input: {
  organizationId: string
  workItemId: string
  deliveryId: string
  evidenceEntry: Readonly<Record<string, any>>
}): GuardianRepositoryObservation {
  const event = input.evidenceEntry.event ?? {}
  const observations: PatrolObservation[] = Array.isArray(event.observations) ? event.observations : []
  const values = (kind: string) => observations
    .filter(item => item?.kind === kind && typeof item.value === 'string')
    .map(item => String(item.value))
  const repository = String(event.target?.value || values('repository')[0] || '').toLowerCase()
  const changedPaths = [...new Set(values('changed_path'))].sort().slice(0, 100)
  const sensitivePaths = changedPaths.filter(sensitivePath)
  const eventType = values('repository_event_type')[0] || 'repository.event'
  const actor = values('provider_reported_actor')[0] || null
  const ref = values('repository_ref')[0] || null
  const commitSha = values('commit_sha')[0] || null
  const correlationId = `github-webhook:${input.deliveryId}`
  const metadata = {
    actor,
    ref,
    commitSha,
    changedPaths,
    sensitivePaths,
    evidenceEntryHash: String(input.evidenceEntry.hash || ''),
  }
  const observation = {
    organization_id: input.organizationId,
    provider_id: 'github',
    resource_type: 'repository',
    resource_id: repository,
    observation_type: 'repository_health',
    severity: sensitivePaths.length ? 'medium' : 'info',
    observed_state: eventType,
    expected_state: 'authorized authenticated repository activity',
    verification_status: 'verified',
    correlation_id: correlationId,
    trigger_source: 'webhook',
    evidence_references: [{
      source: 'security_repository_patrol_evidence',
      eventId: String(event.eventId || ''),
      entryHash: String(input.evidenceEntry.hash || ''),
    }],
    safe_metadata: metadata,
    observed_at: String(event.recordedAt || new Date().toISOString()),
  }
  const alert = sensitivePaths.length ? {
    repo: repository,
    severity: 'medium',
    advisory_id: `guardian-repository-change:${input.deliveryId}`,
    title: 'Security-sensitive repository change observed',
    message: `Authenticated repository activity changed ${sensitivePaths.length} security-sensitive path${sensitivePaths.length === 1 ? '' : 's'}. Review is required; this observation is not an attribution or vulnerability finding.`,
    status: 'open',
  } : null
  return Object.freeze({ observation: Object.freeze(observation), alert: alert ? Object.freeze(alert) : null })
}
