import {
  assertProviderExecutionMode,
  type ProviderExecutionMode,
  type ProviderExecutionPolicy,
} from './provider-execution-modes'

export type ProviderActionPreview = Readonly<{
  templateId: string
  provider: string
  mode: ProviderExecutionMode
  modeLabel: string
  target: string
  payload: Readonly<Record<string, unknown>>
  approvalRequired: boolean
  expectedVerification: string
  executesProviderMutation: boolean
}>

const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key)/i
const MAX_DEPTH = 6
const MAX_KEYS = 100
const MAX_STRING_LENGTH = 2_000

export function providerExecutionModeLabel(mode: ProviderExecutionMode): string {
  switch (mode) {
    case 'direct': return 'Direct API'
    case 'cosa_pr': return 'Governed AI infrastructure PR'
    case 'browser_agent': return 'Browser Agent assistance'
    case 'manual': return 'Direct configuration'
  }
}

export function buildProviderActionPreview(input: {
  templateId: string
  provider: string
  target: string
  payload: Record<string, unknown>
  mode: ProviderExecutionMode
  policy: ProviderExecutionPolicy
  approvalRequired: boolean
  expectedVerification: string
}): ProviderActionPreview {
  assertBoundedText(input.templateId, 'template_id')
  assertBoundedText(input.provider, 'provider')
  assertBoundedText(input.target, 'target')
  assertBoundedText(input.expectedVerification, 'expected_verification')
  assertProviderExecutionMode(input.policy, input.mode)

  const payload = redactAndBound(input.payload)

  return Object.freeze({
    templateId: input.templateId,
    provider: input.provider,
    mode: input.mode,
    modeLabel: providerExecutionModeLabel(input.mode),
    target: input.target,
    payload: deepFreeze(payload),
    approvalRequired: input.approvalRequired,
    expectedVerification: input.expectedVerification,
    executesProviderMutation: input.mode === 'direct',
  })
}

function redactAndBound(value: Record<string, unknown>): Record<string, unknown> {
  return visit(value, 0) as Record<string, unknown>
}

function visit(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new Error('provider_preview_payload_too_deep')
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value

  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) throw new Error('provider_preview_payload_too_large')
    return value.map(item => visit(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > MAX_KEYS) throw new Error('provider_preview_payload_too_large')

    return Object.fromEntries(entries.map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : visit(item, depth + 1),
    ]))
  }

  throw new Error('provider_preview_payload_unsupported_value')
}

function assertBoundedText(value: string, field: string): void {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field}_required`)
  if (normalized.length > 500) throw new Error(`${field}_too_long`)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  }
  return value
}
