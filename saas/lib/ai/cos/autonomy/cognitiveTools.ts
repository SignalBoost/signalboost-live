export type CosCognitiveToolRisk = 'read_only' | 'internal_write' | 'external_effect'

export interface CosCognitiveTool {
  toolId: string
  description: string
  risk: CosCognitiveToolRisk
  inputSchema?: Record<string, unknown>
  execute(input: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string }>
}

export class CosCognitiveToolRegistry {
  private readonly tools = new Map<string, CosCognitiveTool>()

  register(tool: CosCognitiveTool): this {
    const id = tool.toolId?.trim()
    if (!id) throw new Error('cos_tool_missing_id')
    if (this.tools.has(id)) throw new Error(`cos_tool_duplicate:${id}`)
    this.tools.set(id, Object.freeze({ ...tool }))
    return this
  }

  get(toolId: string): CosCognitiveTool | undefined { return this.tools.get(toolId) }

  list(): readonly Pick<CosCognitiveTool, 'toolId' | 'description' | 'risk' | 'inputSchema'>[] {
    return [...this.tools.values()].map(({ toolId, description, risk, inputSchema }) => ({ toolId, description, risk, inputSchema }))
  }
}
