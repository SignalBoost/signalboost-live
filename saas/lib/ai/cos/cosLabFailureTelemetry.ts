// Phase 1 Lab failure-attribution telemetry.
// Reads only independently signed verdict evidence already accepted by cosLabFailureVerdictIngestion.
// It never infers fault from provider status alone.
export const LAB_FAILURE_TELEMETRY_SOURCE = Object.freeze({
  providerJobs: 'cos_university_mass_distillation_provider_jobs',
  verdicts: 'cos_university_learning_assurance_events',
}) as const

export type LabFailureClass = 'COMPETENCY_FAILURE' | 'CUSTOMER_INFRA_FAILURE' | 'PLATFORM_FAILURE'

export type LabFailureTelemetry = Readonly<{
  available: true
  windowSince: string
  terminalFailures: number
  classified: number
  unclassified: number
  classificationCoverage: number | null
  competencyFailures: number
  customerInfraFailures: number
  platformFailures: number
  byProviderStage: Readonly<Record<string, number>>
  source: typeof LAB_FAILURE_TELEMETRY_SOURCE
  methodology: string
}> | Readonly<{
  available: false
  windowSince: string
  error: string
  source: typeof LAB_FAILURE_TELEMETRY_SOURCE
}>

const text = (value: unknown, max = 200): string => String(value ?? '').trim().slice(0, max)

export function composeLabFailureTelemetry(input: {
  since: string
  providerJobs: readonly Readonly<{ job_id?: unknown; provider_stage?: unknown }>[]
  verdictEvents: readonly Readonly<{ evidence?: unknown }>[]
}): Extract<LabFailureTelemetry, { available: true }> {
  const terminal = new Map<string, string>()
  const byProviderStage: Record<string, number> = {}

  for (const row of input.providerJobs) {
    const jobId = text(row.job_id, 240)
    const providerStage = text(row.provider_stage, 40).toUpperCase()
    if (!jobId || !['CANCELED', 'ERROR', 'DELETED'].includes(providerStage)) continue
    terminal.set(jobId, providerStage)
    byProviderStage[providerStage] = (byProviderStage[providerStage] || 0) + 1
  }

  const classificationByJob = new Map<string, LabFailureClass>()
  for (const row of input.verdictEvents) {
    const evidence = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown>
      : null
    if (!evidence) continue
    const jobId = text(evidence.jobId, 240)
    const classification = text(evidence.classification, 40) as LabFailureClass
    if (!terminal.has(jobId)) continue
    if (!['COMPETENCY_FAILURE', 'CUSTOMER_INFRA_FAILURE', 'PLATFORM_FAILURE'].includes(classification)) continue
    // DB uniqueness should make this one-per-job. Keep first if malformed duplicate rows ever appear.
    if (!classificationByJob.has(jobId)) classificationByJob.set(jobId, classification)
  }

  const values = [...classificationByJob.values()]
  const classified = values.length
  const terminalFailures = terminal.size

  return Object.freeze({
    available: true as const,
    windowSince: input.since,
    terminalFailures,
    classified,
    unclassified: Math.max(0, terminalFailures - classified),
    classificationCoverage: terminalFailures ? Number((classified / terminalFailures).toFixed(4)) : null,
    competencyFailures: values.filter(value => value === 'COMPETENCY_FAILURE').length,
    customerInfraFailures: values.filter(value => value === 'CUSTOMER_INFRA_FAILURE').length,
    platformFailures: values.filter(value => value === 'PLATFORM_FAILURE').length,
    byProviderStage: Object.freeze(byProviderStage),
    source: LAB_FAILURE_TELEMETRY_SOURCE,
    methodology: 'settled terminal provider failures in window; classification counted only from independently signed lab_failure_verdict evidence bound to the same provider job',
  })
}

export async function readLabFailureTelemetry(db: any, since: string): Promise<LabFailureTelemetry> {
  try {
    const [jobs, verdicts] = await Promise.all([
      db.from(LAB_FAILURE_TELEMETRY_SOURCE.providerJobs)
        .select('job_id,provider_stage,settled_at')
        .not('settled_at', 'is', null)
        .gte('settled_at', since)
        .in('provider_stage', ['CANCELED', 'ERROR', 'DELETED']),
      db.from(LAB_FAILURE_TELEMETRY_SOURCE.verdicts)
        .select('evidence,observed_at')
        .eq('event_type', 'lab_failure_verdict')
        .gte('observed_at', since),
    ])
    if (jobs.error) throw jobs.error
    if (verdicts.error) throw verdicts.error
    return composeLabFailureTelemetry({
      since,
      providerJobs: Array.isArray(jobs.data) ? jobs.data : [],
      verdictEvents: Array.isArray(verdicts.data) ? verdicts.data : [],
    })
  } catch (error) {
    return Object.freeze({
      available: false as const,
      windowSince: since,
      error: error instanceof Error ? error.message : String(error),
      source: LAB_FAILURE_TELEMETRY_SOURCE,
    })
  }
}
