import type { CosAiPort } from '@/lib/cos/aiPort'
import type { CosCognitiveToolRegistry } from './cognitiveTools'

export interface CosToolLoopInput {
  objective: string
  context?: string
  maxRounds?: number
}

export interface CosToolCallTrace {
  round: number
  toolId: string
  input: Record<string, unknown>
  ok: boolean
  output?: unknown
  error?: string
}

export interface CosToolLoopResult {
  ok: boolean
  answer?: string
  trace: CosToolCallTrace[]
  error?: string
}

type BrainAction =
  | { type: 'tool'; toolId: string; input?: Record<string, unknown>; reason?: string }
  | { type: 'answer'; answer: string }

function parseAction(text: string): BrainAction | null {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const value = JSON.parse(cleaned)
    if (value?.type === 'answer' && typeof value.answer === 'string') return { type: 'answer', answer: value.answer }
    if (value?.type === 'tool' && typeof value.toolId === 'string') {
      return { type: 'tool', toolId: value.toolId, input: value.input && typeof value.input === 'object' ? value.input : {}, reason: typeof value.reason === 'string' ? value.reason : undefined }
    }
  } catch {}
  return null
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value).slice(0, 18000) } catch { return '"[unserializable]"' }
}

export class CosCognitiveToolLoop {
  constructor(private readonly ai: CosAiPort, private readonly tools: CosCognitiveToolRegistry) {}

  async run(input: CosToolLoopInput): Promise<CosToolLoopResult> {
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? 8, 16))
    const trace: CosToolCallTrace[] = []
    const seenCalls = new Set<string>()

    for (let round = 1; round <= maxRounds; round += 1) {
      const catalog = this.tools.list()
      const prompt = [
        `OBJECTIVE:\n${input.objective}`,
        input.context ? `CONTEXT:\n${input.context}` : '',
        `AVAILABLE TOOLS:\n${safeJson(catalog)}`,
        trace.length ? `TOOL RESULTS SO FAR:\n${safeJson(trace)}` : '',
        `Choose the next best step. Return exactly one JSON object and no prose.`,
        `To use a tool: {"type":"tool","toolId":"...","input":{...},"reason":"..."}`,
        `When the objective can be answered: {"type":"answer","answer":"..."}`,
        `Never invent a tool. Prefer evidence over assumptions. Do not call write/external-effect tools unless governance has separately authorized them.`,
      ].filter(Boolean).join('\n\n')

      const response = await this.ai.generate({
        systemPrompt: 'You are COS, an autonomous senior operator. Investigate before concluding, use available tools deliberately, avoid repeating failed calls, and return only the requested JSON control object.',
        prompt,
        maxTokens: 1800,
      })
      const action = parseAction(response || '')
      if (!action) return { ok: false, trace, error: 'cos_brain_invalid_control_output' }
      if (action.type === 'answer') return { ok: true, answer: action.answer, trace }

      const tool = this.tools.get(action.toolId)
      if (!tool) return { ok: false, trace, error: `cos_unknown_tool:${action.toolId}` }
      if (tool.risk !== 'read_only') return { ok: false, trace, error: `cos_tool_requires_governance:${action.toolId}` }

      const toolInput = action.input || {}
      const fingerprint = `${action.toolId}:${safeJson(toolInput)}`
      if (seenCalls.has(fingerprint)) return { ok: false, trace, error: `cos_repeated_tool_call:${action.toolId}` }
      seenCalls.add(fingerprint)

      const result = await tool.execute(toolInput)
      trace.push({ round, toolId: action.toolId, input: toolInput, ok: result.ok, output: result.output, error: result.error })
    }

    return { ok: false, trace, error: 'cos_cognitive_round_budget_exhausted' }
  }
}
