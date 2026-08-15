export const COUNCIL_MACHINE_FACT_PATHS = [
  'outcome_status',
  'verified',
  'healthy',
  'ok',
  'changed',
  'status',
  'state',
  'verificationStatus',
  'verification_status',
  'policyInstanceId',
  'previousIntervalSeconds',
  'currentIntervalSeconds',
  'schedulerSchedule',
  'nativeMonitoringIntervalSeconds',
  'deploymentId',
  'deploymentUrl',
  'verification.verified',
  'verification.healthy',
  'verification.ok',
  'verification.status',
  'verification.state',
  'verification.deploymentId',
  'verification.deploymentUrl',
] as const

export const COUNCIL_MACHINE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const

export type CouncilMachineFactPath = typeof COUNCIL_MACHINE_FACT_PATHS[number]
export type CouncilMachineOperator = typeof COUNCIL_MACHINE_OPERATORS[number]
export type CouncilMachineExpected = string | number | boolean

export type CouncilMachinePrediction = {
  factPath: CouncilMachineFactPath
  operator: CouncilMachineOperator
  expected: CouncilMachineExpected
}

export type CouncilMachineResolution = {
  verdict: 'supported' | 'refuted' | 'unresolved'
  actual?: CouncilMachineExpected
}

function safeText(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function primitive(value: unknown): CouncilMachineExpected | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const text = safeText(value)
    return text ? text : undefined
  }
  return undefined
}

export function normalizeCouncilMachinePrediction(value: unknown): CouncilMachinePrediction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const factPath = safeText(row.fact_path ?? row.factPath, 120) as CouncilMachineFactPath
  const operator = safeText(row.operator, 20).toLowerCase() as CouncilMachineOperator
  const expected = primitive(row.expected)
  if (!(COUNCIL_MACHINE_FACT_PATHS as readonly string[]).includes(factPath)) return null
  if (!(COUNCIL_MACHINE_OPERATORS as readonly string[]).includes(operator)) return null
  if (expected === undefined) return null
  if (['gt', 'gte', 'lt', 'lte'].includes(operator) && typeof expected !== 'number') return null
  return { factPath, operator, expected }
}

function readPath(facts: Record<string, unknown>, path: string): unknown {
  let current: unknown = facts
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function stringEqual(left: string, right: string): boolean {
  return safeText(left).toLowerCase() === safeText(right).toLowerCase()
}

function equals(actual: CouncilMachineExpected, expected: CouncilMachineExpected): boolean {
  if (typeof actual !== typeof expected) return false
  if (typeof actual === 'string' && typeof expected === 'string') return stringEqual(actual, expected)
  return actual === expected
}

/**
 * Resolve a prediction using only an exact bounded objective fact. No model, semantic similarity,
 * confidence score, Council vote, or textual interpretation participates in this comparison.
 */
export function resolveCouncilMachinePrediction(
  prediction: CouncilMachinePrediction,
  facts: Record<string, unknown>,
  outcomeStatus: string,
): CouncilMachineResolution {
  const raw = prediction.factPath === 'outcome_status'
    ? outcomeStatus
    : readPath(facts, prediction.factPath)
  const actual = primitive(raw)
  if (actual === undefined) return { verdict: 'unresolved' }

  let matched = false
  switch (prediction.operator) {
    case 'eq': matched = equals(actual, prediction.expected); break
    case 'neq': matched = !equals(actual, prediction.expected); break
    case 'gt': matched = typeof actual === 'number' && typeof prediction.expected === 'number' && actual > prediction.expected; break
    case 'gte': matched = typeof actual === 'number' && typeof prediction.expected === 'number' && actual >= prediction.expected; break
    case 'lt': matched = typeof actual === 'number' && typeof prediction.expected === 'number' && actual < prediction.expected; break
    case 'lte': matched = typeof actual === 'number' && typeof prediction.expected === 'number' && actual <= prediction.expected; break
  }
  return { verdict: matched ? 'supported' : 'refuted', actual }
}
