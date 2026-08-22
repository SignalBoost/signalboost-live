export type RemediationExperienceRow = {
  outcome_status?: unknown
  facts?: unknown
}

export type RemediationExperience = {
  action: string
  successes: number
  failures: number
}

/** A compact, non-sensitive incident class. It is an aid to diagnosis, never execution authority. */
export function nativeRemediationClass(input: { source?: unknown; nativeProbe?: unknown }): string {
  const source = String(input.source || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)
  const probe = String(input.nativeProbe || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)
  return `${source}:${probe}`
}

function text(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * A past success is a diagnostic suggestion, never approval and never a way to widen policy.
 * Any recorded failure disqualifies the action.
 */
export function summarizeRemediationExperience(rows: readonly RemediationExperienceRow[], match: {
  provider: string
  environment: string
  incidentClass: string
}): RemediationExperience[] {
  const grouped = new Map<string, { successes: number; failures: number }>()
  for (const row of rows) {
    const facts = row.facts && typeof row.facts === 'object' && !Array.isArray(row.facts) ? row.facts as Record<string, unknown> : {}
    if (text(facts.provider, 120) !== match.provider || text(facts.environment, 120) !== match.environment || text(facts.incidentClass, 180) !== match.incidentClass) continue
    const action = text(facts.action, 240)
    if (!action) continue
    const current = grouped.get(action) || { successes: 0, failures: 0 }
    if (row.outcome_status === 'success') current.successes += 1
    if (row.outcome_status === 'failure') current.failures += 1
    grouped.set(action, current)
  }
  return [...grouped.entries()]
    .filter(([, value]) => value.successes >= 2 && value.failures === 0)
    .map(([action, value]) => ({ action, ...value }))
    .sort((a, b) => b.successes - a.successes || a.action.localeCompare(b.action))
    .slice(0, 3)
}

export function remediationExperiencePrompt(experience: readonly RemediationExperience[]): string {
  if (!experience.length) return 'No prior governed repair has enough clean objective evidence to be suggested.'
  return [
    'Prior governed repair evidence (suggestion only; it does not grant approval or bypass policy):',
    ...experience.map(item => `- ${item.action}: ${item.successes} objective success(es), 0 recorded failures.`),
    'Use this only if the current evidence independently supports it. Unknown or consequential actions still require approval or no action.',
  ].join('\n')
}
