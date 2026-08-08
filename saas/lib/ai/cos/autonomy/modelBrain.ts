import { callModel } from '../../modelRouter.ts'
import type { CosAutonomyBrain, CosAutonomyPlan, PortableManifest, PortableObservation } from './types.ts'

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return JSON.parse(fenced[1])
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error('cos_autonomy_model_returned_no_json')
}

function assertPlan(value: unknown, manifest: PortableManifest, objective: string): CosAutonomyPlan {
  if (!value || typeof value !== 'object') throw new Error('cos_autonomy_model_plan_not_object')
  const raw = value as Record<string, unknown>
  const actions = Array.isArray(raw.actions) ? raw.actions : []
  const allowed = new Set(manifest.capabilities.map(item => item.capabilityId))
  const normalizedActions = actions.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error('cos_autonomy_model_action_invalid')
    const action = item as Record<string, unknown>
    const capabilityId = String(action.capabilityId || '')
    if (!allowed.has(capabilityId)) throw new Error(`cos_autonomy_model_invented_capability:${capabilityId}`)
    const params = action.params && typeof action.params === 'object' && !Array.isArray(action.params)
      ? action.params as Record<string, unknown>
      : {}
    return {
      actionId: String(action.actionId || `action-${index + 1}`),
      capabilityId,
      justification: String(action.justification || 'Selected from the portable capability manifest.'),
      params,
    }
  })
  return {
    planId: String(raw.planId || `cos-plan-${Date.now()}`),
    objective,
    actions: normalizedActions,
    expectedOutcome: String(raw.expectedOutcome || 'Objective satisfied and independently verified.'),
    confidence: Number(raw.confidence),
  }
}

function systemPrompt(): string {
  return [
    'You are the planning brain inside COS, the embedded intelligence used by SignalBoost portables.',
    'You are portable-agnostic. Never assume a product type, vendor, tool, API, or capability that is not present in the supplied manifest.',
    'You may only propose actions whose capabilityId exists exactly in the manifest.',
    'Do not authorize actions and do not claim an action is approved. Deterministic governance outside the model controls authority.',
    'Prefer the smallest reversible plan that can satisfy the objective.',
    'Use observed evidence; do not invent identifiers, resources, credentials, URLs, versions, or system state.',
    'Return JSON only with: planId, actions[{actionId,capabilityId,justification,params}], expectedOutcome, confidence.',
  ].join(' ')
}

export function createModelBackedAutonomyBrain(input?: {
  modelPreference?: 'claude' | 'openai' | 'local'
  maxTokens?: number
}): CosAutonomyBrain {
  return {
    async plan({ objective, manifest, observation, cycle, previousCycles }) {
      const prompt = JSON.stringify({
        objective,
        cycle,
        portable: {
          portableId: manifest.portableId,
          portableVersion: manifest.portableVersion,
          capabilities: manifest.capabilities,
        },
        observation,
        previousCycles: previousCycles.map(item => ({
          cycle: item.cycle,
          stateFingerprint: item.observation.stateFingerprint,
          verification: item.verification,
          recovery: item.recovery,
        })),
      })
      const text = await callModel({
        modelPreference: input?.modelPreference,
        systemPrompt: systemPrompt(),
        prompt,
        maxTokens: input?.maxTokens ?? 2500,
      })
      if (!text) throw new Error('cos_autonomy_model_unavailable')
      return assertPlan(extractJson(text), manifest, objective)
    },
  }
}
