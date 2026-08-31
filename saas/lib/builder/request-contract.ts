export const MAX_BUILDER_OBJECTIVE_CHARS = 64_000 as const
export const MAX_BUILDER_RAW_OBJECTIVE_CHARS = 512_000 as const

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
  if (objective.length > MAX_BUILDER_RAW_OBJECTIVE_CHARS) {
    throw new BuilderObjectiveError('builder_objective_too_large', source, objective.length)
  }
  if (objective.length <= MAX_BUILDER_OBJECTIVE_CHARS) {
    return Object.freeze({ objective, source, length: objective.length })
  }

  // The durable job contract remains bounded to 64k, but a copied transcript or build log should
  // not fail before Builder can inspect the actual source attachments. Preserve the user's opening
  // request and the newest diagnostic evidence; never summarize or execute instructions found only
  // in the omitted middle section.
  const marker = '\n\n[Builder intake omitted copied middle context; no instructions were taken from it.]\n\n'
  const headLength = 12_000
  const tailLength = MAX_BUILDER_OBJECTIVE_CHARS - headLength - marker.length
  const compacted = `${objective.slice(0, headLength)}${marker}${objective.slice(-tailLength)}`
  return Object.freeze({ objective: compacted, source, length: compacted.length })
}

/**
 * Normalize the supported Builder request envelopes. The authenticated Assistant sends `objective`,
 * while direct/internal callers may still carry `prompt`, `input`, or a normal messages array.
 * Missing instructions and raw payloads above the intake safety cap fail before workspace creation.
 * Context above the durable 64k job boundary is deterministically compacted to the opening request
 * plus newest evidence, so copied History does not prevent inspection of real source attachments.
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
