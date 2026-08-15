import { RETRY_DEPLOYMENT_TARGET } from '@/agent-gateway-host/deployment-recovery'
import { recordCouncilFollowupObjectiveOutcome } from '@/lib/ai/cos/councilObjectiveOutcome'
import { classifyExactVercelDeployment } from './vercel-deployment-verification-pure.ts'

export type VercelRepairVerificationSummary = {
  candidates: number
  checked: number
  alreadyRecorded: number
  pending: number
  success: number
  failure: number
  recorded: number
  errors: string[]
}

type ObjectiveOutcomeRow = {
  id: string
  source_ref: string
  outcome_status: string
  facts: Record<string, unknown> | null
  created_at: string
}

function safeText(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function exactDeploymentId(facts: Record<string, unknown> | null): string | null {
  const value = safeText(facts?.deploymentId, 300)
  return /^dpl_[A-Za-z0-9]+$/.test(value) ? value : null
}

function terminalSourceRef(deploymentId: string): string {
  return `vercel-deployment:${deploymentId}:terminal`
}

async function fetchExactDeployment(deploymentId: string): Promise<unknown> {
  const token = String(process.env.VERCEL_TOKEN || '').trim()
  if (!token) throw new Error('VERCEL_TOKEN is not configured for exact deployment verification')
  const teamId = String(process.env.VERCEL_TEAM_ID || '').trim()
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = safeText((body as any)?.error?.message || (body as any)?.message || '', 300)
      throw new Error(`Vercel exact deployment read failed (${response.status})${detail ? `: ${detail}` : ''}`)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Resolve prior-cycle Self-Healing deployment retries using only the exact deployment ID returned by
 * the initiating governed operation. An unrelated newer READY deployment can never satisfy this path.
 *
 * Terminal evidence is appended as a new immutable production_outcome row whose Council session and
 * correlation are inherited from the exact parent deterministic_tool outcome. Pending/provider errors
 * produce no verdict and will be checked again on a later native monitoring cycle.
 */
export async function verifyPendingExactVercelRepairOutcomes(db: any): Promise<VercelRepairVerificationSummary> {
  const summary: VercelRepairVerificationSummary = {
    candidates: 0,
    checked: 0,
    alreadyRecorded: 0,
    pending: 0,
    success: 0,
    failure: 0,
    recorded: 0,
    errors: [],
  }

  const since = new Date(Date.now() - 48 * 60 * 60_000).toISOString()
  const sourceRows = await db
    .from('cos_council_objective_outcomes')
    .select('id,source_ref,outcome_status,facts,created_at')
    .eq('source_class', 'deterministic_tool')
    .eq('outcome_status', 'observed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60)

  if (sourceRows.error) {
    summary.errors.push(`objective_outcome_read_failed:${safeText(sourceRows.error.message || sourceRows.error, 300)}`)
    return summary
  }

  const candidates = ((sourceRows.data ?? []) as ObjectiveOutcomeRow[]).filter(row => {
    const facts = row.facts && typeof row.facts === 'object' && !Array.isArray(row.facts) ? row.facts : null
    return safeText(facts?.resolvedTarget, 300) === RETRY_DEPLOYMENT_TARGET && Boolean(exactDeploymentId(facts))
  })
  summary.candidates = candidates.length
  if (!candidates.length) return summary

  const refs = [...new Set(candidates.map(row => terminalSourceRef(exactDeploymentId(row.facts) as string)))]
  const existingRows = await db
    .from('cos_council_objective_outcomes')
    .select('source_ref')
    .eq('source_class', 'production_outcome')
    .in('source_ref', refs)
    .limit(Math.max(1, refs.length))

  if (existingRows.error) {
    summary.errors.push(`terminal_outcome_read_failed:${safeText(existingRows.error.message || existingRows.error, 300)}`)
    return summary
  }
  const existing = new Set<string>(((existingRows.data ?? []) as Array<{ source_ref?: string }>).map(row => safeText(row.source_ref, 1000)).filter(Boolean))

  for (const parent of candidates) {
    const deploymentId = exactDeploymentId(parent.facts)
    if (!deploymentId) continue
    const sourceRef = terminalSourceRef(deploymentId)
    if (existing.has(sourceRef)) {
      summary.alreadyRecorded += 1
      continue
    }

    try {
      const deployment = await fetchExactDeployment(deploymentId)
      summary.checked += 1
      const classified = classifyExactVercelDeployment({ expectedDeploymentId: deploymentId, deployment })
      if (!classified) {
        summary.errors.push(`${deploymentId}:exact_deployment_identity_mismatch_or_invalid_payload`)
        continue
      }
      if (!classified.terminal || !classified.outcomeStatus || classified.verified == null) {
        summary.pending += 1
        continue
      }

      const recorded = await recordCouncilFollowupObjectiveOutcome({
        parentOutcomeId: parent.id,
        sourceClass: 'production_outcome',
        sourceRef,
        outcomeStatus: classified.outcomeStatus,
        summary: classified.outcomeStatus === 'success'
          ? `The exact Vercel deployment created by the governed retry reached READY: ${deploymentId}.`
          : `The exact Vercel deployment created by the governed retry reached terminal ${classified.state}: ${deploymentId}.`,
        facts: {
          verified: classified.verified,
          healthy: classified.verified,
          status: classified.state,
          state: classified.state,
          deploymentId: classified.deploymentId,
          deploymentUrl: classified.deploymentUrl,
        },
      })
      existing.add(sourceRef)
      if (recorded.inserted) summary.recorded += 1
      summary[classified.outcomeStatus] += 1
    } catch (error) {
      summary.errors.push(`${deploymentId}:${safeText(error instanceof Error ? error.message : error, 400)}`)
    }
  }

  return summary
}
