export type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  description?: string
  default?: unknown
  enum?: unknown[]
  items?: JsonSchema
  [key: string]: unknown
}

export interface CanonicalToolDescription<TArgs = unknown, TResult = unknown> {
  name: string
  description: string
  parameters: JsonSchema
  execute: (args: TArgs) => Promise<TResult>
}

export type COSProvider = 'openai' | 'anthropic'

export type COToolCall = {
  id: string
  name: string
  arguments: unknown
}

export type Layer5Response = {
  content: unknown
  toolCalls?: COToolCall[]
  updatedState?: unknown
}

export type Layer5Request = {
  provider: COSProvider
  model: string
  messages: unknown[]
  tools: unknown[]
}

export type ComputeSelection = {
  provider: COSProvider
  model: string
}

export type ComputeSelector<TGovernance = unknown> = (
  requestedModel: string,
  governanceState: TGovernance,
) => ComputeSelection | Promise<ComputeSelection>

export type Layer5Executor = (request: Layer5Request) => Promise<Layer5Response>

export function assertCanonicalTool(tool: CanonicalToolDescription): void {
  if (!tool || typeof tool !== 'object') throw new Error('[COS] Invalid canonical tool')
  if (!tool.name || !/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
    throw new Error(`[COS] Invalid tool name: ${String(tool.name)}`)
  }
  if (!tool.description || typeof tool.description !== 'string') {
    throw new Error(`[COS] Tool ${tool.name} requires a description`)
  }
  if (!tool.parameters || typeof tool.parameters !== 'object') {
    throw new Error(`[COS] Tool ${tool.name} requires a JSON Schema parameters object`)
  }
  if (typeof tool.execute !== 'function') {
    throw new Error(`[COS] Tool ${tool.name} requires a local execute function`)
  }
}
