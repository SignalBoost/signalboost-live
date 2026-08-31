export const MAX_VISUAL_OBJECTIVE_CHARS = 8_000 as const

export type VisualObjectiveSource = 'objective' | 'prompt' | 'input' | 'messages'
export type VisualObjectiveFailureCode = 'visual_objective_required' | 'visual_objective_too_large'

export type VisualObjective = Readonly<{
  objective: string
  source: VisualObjectiveSource
  length: number
}>

export class VisualObjectiveError extends Error {
  readonly code: VisualObjectiveFailureCode
  readonly source: VisualObjectiveSource | null
  readonly observedLength: number
  readonly maxLength = MAX_VISUAL_OBJECTIVE_CHARS

  constructor(code: VisualObjectiveFailureCode, source: VisualObjectiveSource | null, observedLength: number) {
    super(code)
    this.name = 'VisualObjectiveError'
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

function validatedObjective(value: string, source: VisualObjectiveSource): VisualObjective {
  const objective = value.replace(/\0/g, '').trim()
  if (!objective) throw new VisualObjectiveError('visual_objective_required', source, 0)
  if (objective.length > MAX_VISUAL_OBJECTIVE_CHARS) {
    throw new VisualObjectiveError('visual_objective_too_large', source, objective.length)
  }
  return Object.freeze({ objective, source, length: objective.length })
}

/**
 * Normalize every supported visual request envelope. The public Concierge composer permits 8,000
 * characters, so the visual route must not retain the older 4,000-character private ceiling.
 * Direct and internal callers may send objective, prompt, input, or a normal messages array.
 */
export function readVisualObjective(body: unknown): VisualObjective {
  const input = record(body)
  const direct: Array<readonly [VisualObjectiveSource, unknown]> = [
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

  throw new VisualObjectiveError('visual_objective_required', null, 0)
}

export function isVisualObjectiveError(error: unknown): error is VisualObjectiveError {
  return error instanceof VisualObjectiveError
}
