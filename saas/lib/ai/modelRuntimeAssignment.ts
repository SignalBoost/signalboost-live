// saas/lib/ai/modelRuntimeAssignment.ts
import { allPlatformModelProfiles } from './modelCapabilityRegistry.ts'
import { createBuiltinModelTransportAdapters } from './modelTransportAdapters.ts'
import { requireTransportForProfile } from './modelTransportAdapter.ts'
import { createSignalBoostModelConfigurationPort } from './modelConfigurationSignalBoost.ts'
import type { AssignableModelUse, ModelConfigurationPort } from './modelConfigurationPort.ts'
import { currentHarnessExecutionContext, reserveHarnessProviderCostUsd } from '../../platform-harness/runtime/execution-context.ts'
import type { LocalModelCallArgs, LocalModelTurnResult } from './local-inference.ts'

export type AssignedModelDescriptor = Readonly<{
  assignmentId: string
  use: AssignableModelUse
  profileKey: string
  modelId: string
  providerModelId: string
  family: string
  transportProtocol: string
  provider: string
}>

export async function currentAssignedModelDescriptor(
  use: AssignableModelUse,
  options: { store?: ModelConfigurationPort } = {},
): Promise<AssignedModelDescriptor | null> {
  let store: ModelConfigurationPort
  try { store = options.store || createSignalBoostModelConfigurationPort() } catch { return null }
  try {
    const current = await store.currentAssignment(use)
    if (!current) return null
    const registration = await store.getRegistration(current.profileKey)
    if (!registration || !registration.enabled) return null
    return Object.freeze({
      assignmentId: current.assignmentId,
      use,
      profileKey: registration.profile.key,
      modelId: registration.profile.modelId,
      providerModelId: registration.profile.providerModelId,
      family: registration.profile.family,
      transportProtocol: registration.binding.protocol,
      provider: registration.binding.provider,
    })
  } catch {
    return null
  }
}

export type AssignedModelAttempt = Readonly<{
  attempted: boolean
  result: LocalModelTurnResult | null
  profileKey: string | null
  assignmentId: string | null
}>

function featureUse(args: LocalModelCallArgs): AssignableModelUse {
  const feature = String(args.usageContext?.feature || '').trim().toLowerCase()
  const purpose = String(args.usageContext?.purpose || '').trim().toLowerCase()
  if (feature.startsWith('builder') || purpose.includes('coding_harness')) return 'builder'
  if (feature.includes('specialist') || purpose.includes('specialist')) return 'specialist'
  return 'cos_reasoner'
}

function platformMessages(args: LocalModelCallArgs) {
  const messages = args.messages?.length
    ? args.messages.map(message => ({
        role: message.role,
        content: message.content ?? null,
        ...(message.tool_call_id ? { toolCallId: message.tool_call_id } : {}),
        ...(message.tool_calls?.length ? {
          toolCalls: message.tool_calls.map(call => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          })),
        } : {}),
      }))
    : [{ role: 'user' as const, content: args.prompt }]
  return Object.freeze([
    ...(args.systemPrompt ? [{ role: 'system' as const, content: args.systemPrompt }] : []),
    ...messages,
  ])
}

function platformTools(args: LocalModelCallArgs) {
  return args.tools?.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))
}

function toolChoice(args: LocalModelCallArgs) {
  if (!args.toolChoice || args.toolChoice === 'auto' || args.toolChoice === 'none') return args.toolChoice
  return { name: args.toolChoice.function.name }
}

function localToolCalls(calls: readonly { id: string; name: string; arguments: string }[]) {
  return Object.freeze(calls.map(call => Object.freeze({
    id: call.id,
    type: 'function' as const,
    function: Object.freeze({ name: call.name, arguments: call.arguments }),
  })))
}

export async function tryAssignedPlatformModelTurn(
  args: LocalModelCallArgs,
  requestedUse?: AssignableModelUse,
  options: { store?: ModelConfigurationPort; adapters?: readonly import('./modelTransportAdapter.ts').ModelTransportAdapter[] } = {},
): Promise<AssignedModelAttempt> {
  let store: ModelConfigurationPort
  try {
    store = options.store || createSignalBoostModelConfigurationPort()
  } catch {
    return Object.freeze({ attempted: false, result: null, profileKey: null, assignmentId: null })
  }
  const use = requestedUse || featureUse(args)
  let current
  try {
    current = await store.currentAssignment(use)
  } catch (error) {
    console.warn('[platform-model-assignment] durable registry unavailable; existing routing remains authoritative', error instanceof Error ? error.message : String(error))
    return Object.freeze({ attempted: false, result: null, profileKey: null, assignmentId: null })
  }
  if (!current) return Object.freeze({ attempted: false, result: null, profileKey: null, assignmentId: null })

  const registration = await store.getRegistration(current.profileKey)
  if (!registration || !registration.enabled) throw new Error('platform_model_assignment_registration_unavailable')
  if (!registration.profile.uses.includes(use)) throw new Error('platform_model_assignment_use_mismatch')
  if (registration.profile.inference.chatCompletion !== 'validated') throw new Error('platform_model_assignment_chat_not_validated')

  const profiles = Object.freeze([...allPlatformModelProfiles(), registration.profile])
  const adapters = options.adapters || createBuiltinModelTransportAdapters({
    profiles,
    bindings: [registration.binding],
    resolveCredential: ref => store.vault.resolve(ref),
  })
  const adapter = requireTransportForProfile(registration.profile, adapters)

  const harness = currentHarnessExecutionContext()
  if (harness?.providerCostLedger) {
    if (registration.binding.maxCallCostUsd <= 0 && registration.binding.credentialRef) {
      throw new Error('platform_model_assignment_cost_ceiling_required')
    }
    if (registration.binding.maxCallCostUsd > 0) reserveHarnessProviderCostUsd(registration.binding.maxCallCostUsd)
  }

  const started = Date.now()
  const requestJson = args.jsonObject === true
    && adapter.protocol !== 'anthropic_messages'
    && registration.profile.inference.structuredJson === 'validated'
  const response = await adapter.chat({
    profile: registration.profile,
    messages: platformMessages(args),
    maxOutputTokens: args.maxTokens,
    temperature: args.temperature,
    jsonObject: requestJson,
    tools: platformTools(args),
    toolChoice: toolChoice(args),
    timeoutMs: args.timeoutMs,
  })
  const result: LocalModelTurnResult = Object.freeze({
    content: response.text,
    toolCalls: localToolCalls(response.toolCalls),
    finishReason: response.finishReason,
    provider: response.provider,
    model: response.model,
  })
  console.info('[platform-model-assignment-telemetry]', JSON.stringify({
    at: new Date().toISOString(),
    assignmentId: current.assignmentId,
    use,
    profileKey: registration.profile.key,
    protocol: adapter.protocol,
    provider: response.provider,
    model: response.model,
    latencyMs: Date.now() - started,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    requestId: response.requestId,
    success: Boolean(response.text || response.toolCalls.length),
    crossModelFallbackAllowed: false,
  }))
  return Object.freeze({
    attempted: true,
    result: response.text || response.toolCalls.length ? result : null,
    profileKey: registration.profile.key,
    assignmentId: current.assignmentId,
  })
}
