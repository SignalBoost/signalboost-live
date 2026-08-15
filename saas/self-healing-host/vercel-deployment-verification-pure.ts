export type ExactVercelDeploymentVerification = {
  deploymentId: string
  deploymentUrl: string | null
  state: string
  terminal: boolean
  outcomeStatus: 'success' | 'failure' | null
  verified: boolean | null
}

function text(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

/**
 * Classify only the deployment object returned for the exact deployment ID created by a repair.
 * A different ID, a non-terminal state, or a malformed payload cannot become objective evidence.
 */
export function classifyExactVercelDeployment(input: {
  expectedDeploymentId: string
  deployment: unknown
}): ExactVercelDeploymentVerification | null {
  const expected = text(input.expectedDeploymentId, 300)
  if (!expected) return null
  if (!input.deployment || typeof input.deployment !== 'object' || Array.isArray(input.deployment)) return null

  const row = input.deployment as Record<string, unknown>
  const actual = text(row.id ?? row.uid, 300)
  if (!actual || actual !== expected) return null

  const state = text(row.readyState ?? row.status ?? row.state, 80).toUpperCase()
  if (!state) return null
  const deploymentUrlRaw = text(row.url, 1000)
  const deploymentUrl = deploymentUrlRaw
    ? (deploymentUrlRaw.startsWith('http://') || deploymentUrlRaw.startsWith('https://') ? deploymentUrlRaw : `https://${deploymentUrlRaw}`)
    : null

  if (state === 'READY') {
    return { deploymentId: actual, deploymentUrl, state, terminal: true, outcomeStatus: 'success', verified: true }
  }
  if (state === 'ERROR' || state === 'CANCELED' || state === 'CANCELLED') {
    return { deploymentId: actual, deploymentUrl, state, terminal: true, outcomeStatus: 'failure', verified: false }
  }
  return { deploymentId: actual, deploymentUrl, state, terminal: false, outcomeStatus: null, verified: null }
}
