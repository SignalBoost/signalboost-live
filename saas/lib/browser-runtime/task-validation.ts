import type { BrowserTask, BrowserTaskMode } from './contracts.ts'

const SUPPORTED_TASK_MODES = new Set<BrowserTaskMode>([
  'observe',
  'prepare_change',
  'execute_change',
])
const SUPPORTED_STEP_KINDS = new Set([
  'navigate',
  'click',
  'fill',
  'wait_for',
  'screenshot',
  'checkpoint',
])
const MAX_BROWSER_TASK_STEPS = 128
const MAX_STEP_VALUE_LENGTH = 2_048
const MAX_STEP_LABEL_LENGTH = 512
const MAX_WAIT_TIMEOUT_MS = 120_000
const REFERENCE_URI = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i

type UnknownRecord = Record<string, unknown>

function assertPlainObject(value: unknown, label: string): asserts value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`)
  }
}

function assertExactKeys(value: UnknownRecord, allowedKeys: string[], label: string): void {
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(value).filter(key => !allowed.has(key))
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.sort().join(', ')}`)
  }
}

function assertBoundedString(
  value: unknown,
  label: string,
  maxLength = MAX_STEP_VALUE_LENGTH,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim()
  ) {
    throw new Error(`${label} must be a non-empty canonical string`)
  }
}

function validateNavigateStep(
  step: UnknownRecord,
  stepLabel: string,
  allowedOrigins: Set<string>,
): void {
  assertExactKeys(step, ['id', 'kind', 'url'], stepLabel)
  assertBoundedString(step.url, `${stepLabel} url`)

  let target: URL
  try {
    target = new URL(step.url)
  } catch {
    throw new Error(`${stepLabel} url must be a valid HTTP(S) URL`)
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(`${stepLabel} url must be a valid HTTP(S) URL`)
  }
  if (target.username !== '' || target.password !== '') {
    throw new Error(`${stepLabel} url must not include embedded credentials`)
  }
  if (!allowedOrigins.has(target.origin)) {
    throw new Error(`${stepLabel} url origin is not approved: ${target.origin}`)
  }
}

function validateSelectorStep(
  step: UnknownRecord,
  stepLabel: string,
  allowedKeys: string[],
): void {
  assertExactKeys(step, allowedKeys, stepLabel)
  assertBoundedString(step.selector, `${stepLabel} selector`)
}

function validateFillStep(step: UnknownRecord, stepLabel: string): void {
  validateSelectorStep(step, stepLabel, ['id', 'kind', 'selector', 'valueRef'])
  assertBoundedString(step.valueRef, `${stepLabel} valueRef`)
  if (!REFERENCE_URI.test(step.valueRef)) {
    throw new Error(`${stepLabel} valueRef must be an explicit reference URI`)
  }
}

function validateWaitStep(step: UnknownRecord, stepLabel: string): void {
  validateSelectorStep(step, stepLabel, ['id', 'kind', 'selector', 'timeoutMs'])
  if (step.timeoutMs === undefined) return
  if (
    typeof step.timeoutMs !== 'number' ||
    !Number.isSafeInteger(step.timeoutMs) ||
    step.timeoutMs <= 0 ||
    step.timeoutMs > MAX_WAIT_TIMEOUT_MS
  ) {
    throw new Error(
      `${stepLabel} timeoutMs must be a positive safe integer no greater than ${MAX_WAIT_TIMEOUT_MS}`,
    )
  }
}

function validateScreenshotStep(step: UnknownRecord, stepLabel: string): void {
  assertExactKeys(step, ['id', 'kind', 'label'], stepLabel)
  assertBoundedString(step.label, `${stepLabel} label`, MAX_STEP_LABEL_LENGTH)
}

function validateCheckpointStep(step: UnknownRecord, stepLabel: string): void {
  assertExactKeys(step, ['id', 'kind', 'label', 'requiresApproval'], stepLabel)
  assertBoundedString(step.label, `${stepLabel} label`, MAX_STEP_LABEL_LENGTH)
  if (step.requiresApproval !== true) {
    throw new Error(`${stepLabel} requiresApproval must be true`)
  }
}

export function validateBrowserTaskShape(task: BrowserTask, approvedOrigins: string[]): void {
  if (!SUPPORTED_TASK_MODES.has(task.mode)) {
    throw new Error('Browser task mode is unsupported')
  }
  if (!Array.isArray(task.steps) || task.steps.length === 0) {
    throw new Error('Browser task must contain at least one step')
  }
  if (task.steps.length > MAX_BROWSER_TASK_STEPS) {
    throw new Error(`Browser task must contain no more than ${MAX_BROWSER_TASK_STEPS} steps`)
  }

  const allowedOrigins = new Set(approvedOrigins)
  let checkpointCount = 0

  for (let index = 0; index < task.steps.length; index += 1) {
    const rawStep = task.steps[index] as unknown
    const stepLabel = `Browser task step ${index + 1}`
    assertPlainObject(rawStep, stepLabel)
    assertBoundedString(rawStep.id, `${stepLabel} id`)
    assertBoundedString(rawStep.kind, `${stepLabel} kind`)

    if (!SUPPORTED_STEP_KINDS.has(rawStep.kind)) {
      throw new Error(`${stepLabel} has unsupported kind: ${rawStep.kind}`)
    }

    if (rawStep.kind === 'navigate') {
      validateNavigateStep(rawStep, stepLabel, allowedOrigins)
    } else if (rawStep.kind === 'click') {
      validateSelectorStep(rawStep, stepLabel, ['id', 'kind', 'selector'])
    } else if (rawStep.kind === 'fill') {
      validateFillStep(rawStep, stepLabel)
    } else if (rawStep.kind === 'wait_for') {
      validateWaitStep(rawStep, stepLabel)
    } else if (rawStep.kind === 'screenshot') {
      validateScreenshotStep(rawStep, stepLabel)
    } else {
      checkpointCount += 1
      validateCheckpointStep(rawStep, stepLabel)
    }
  }

  if (checkpointCount > 1) {
    throw new Error('Browser task must contain at most one approval checkpoint')
  }
}
