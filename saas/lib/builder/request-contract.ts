export const MAX_BUILDER_OBJECTIVE_CHARS = 64_000 as const

export type BuilderObjectiveSource = 'objective' | 'prompt' | 'input' | 'messages'
export type BuilderObjectiveFailureCode = 'builder_objective_required' | 'builder_objective_too_large'

export type BuilderObjective = Readonly<{
  objective: string
  source: BuilderObjectiveSource
  length: number
}>

export class BuilderObjectiveError extends Error {
  readonly code: BuilderObjectiveFailureCode
  readonly source: BuilderObjectiveSource | null
  readonly observedLength: number
  readonly maxLength = MAX_BUILDER_OBJECTIVE_CHARS

  constructor(code: BuilderObjectiveFailureCode, source: BuilderObjectiveSource | null, observedLength: number) {
    super(code)
    this.name = 'BuilderObjectiveError'
    this.code = code
    this.source = source
    this.observedLength = Math.max(0, Math.floor(observedLength || 0))
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map(block => {
      const item = record(block)
      return typeof item.text === 'string' ? item.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function validatedObjective(value: string, source: BuilderObjectiveSource): BuilderObjective {
  const objective = value.trim()
  if (!objective) throw new BuilderObjectiveError('builder_objective_required', source, 0)
  if (objective.length > MAX_BUILDER_OBJECTIVE_CHARS) {
    throw new BuilderObjectiveError('builder_objective_too_large', source, objective.length)
  }
  return Object.freeze({ objective, source, length: objective.length })
}

/**
 * Normalize the supported Builder request envelopes. The authenticated Assistant sends `objective`,
 * while direct/internal callers may still carry `prompt`, `input`, or a normal messages array.
 * Missing or oversized instructions fail before workspace creation and never become an opaque
 * `builder_invalid_objective` control-plane error.
 */
export function readBuilderObjective(body: unknown): BuilderObjective {
  const input = record(body)
  const direct: Array<readonly [BuilderObjectiveSource, unknown]> = [
    ['objective', input.objective],
    ['prompt', input.prompt],
    ['input', input.input],
  ]

  for (const [source, candidate] of direct) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue
    return validatedObjective(candidate, source)
  }

  const messages = Array.isArray(input.messages) ? input.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = record(messages[index])
    if (message.role !== 'user') continue
    const candidate = messageText(message.content)
    if (!candidate.trim()) continue
    return validatedObjective(candidate, 'messages')
  }

  throw new BuilderObjectiveError('builder_objective_required', null, 0)
}

export function isBuilderObjectiveError(error: unknown): error is BuilderObjectiveError {
  return error instanceof BuilderObjectiveError
}
