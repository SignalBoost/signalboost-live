import { ToolCompiler } from './compiler'
import type {
  CanonicalToolDescription,
  ComputeSelector,
  Layer5Executor,
} from './types'

export type ReasoningResult<TGovernance = unknown> =
  | { status: 'tool_executed'; data: Array<{ toolCallId: string; toolName: string; result: unknown }>; governanceState: TGovernance }
  | { status: 'completed'; data: unknown; governanceState: TGovernance }

export async function processReasoningLayer<TGovernance = unknown>(
  payload: {
    taskId: string
    messages: unknown[]
    availableTools: CanonicalToolDescription[]
    requestedModel: string
  },
  governanceState: TGovernance,
  dependencies: {
    selectCompute: ComputeSelector<TGovernance>
    executeProvider: Layer5Executor
  },
): Promise<ReasoningResult<TGovernance>> {
  const { model, provider } = await dependencies.selectCompute(payload.requestedModel, governanceState)
  const vendorTools = provider === 'openai'
    ? ToolCompiler.toOpenAI(payload.availableTools)
    : ToolCompiler.toAnthropic(payload.availableTools)

  const llmResponse = await dependencies.executeProvider({
    provider,
    model,
    messages: payload.messages,
    tools: vendorTools,
  })

  const nextGovernanceState = (llmResponse.updatedState ?? governanceState) as TGovernance
  if (llmResponse.toolCalls?.length) {
    const outputs = []
    for (const call of llmResponse.toolCalls) {
      const localTool = payload.availableTools.find((tool) => tool.name === call.name)
      if (!localTool) {
        throw new Error(`[COS Critical]: Model attempted to call unknown tool: ${call.name}`)
      }

      outputs.push({
        toolCallId: call.id,
        toolName: call.name,
        result: await localTool.execute(call.arguments),
      })
    }

    return { status: 'tool_executed', data: outputs, governanceState: nextGovernanceState }
  }

  return { status: 'completed', data: llmResponse.content, governanceState: nextGovernanceState }
}

export type { CanonicalToolDescription } from './types'
export { ToolCompiler } from './compiler'
