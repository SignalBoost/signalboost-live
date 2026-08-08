import { callModel } from '../../modelRouter.ts'
import type { PortableManifest, PortableObservation } from './types.ts'

export interface CosMission {
  missionId: string
  purpose: string
  priorities: readonly string[]
  constraints: readonly string[]
  successCriteria: readonly string[]
}

export interface CosMissionDecision {
  decisionId: string
  objective: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  rationale: string
  evidenceIds: readonly string[]
  shouldAct: boolean
  confidence: number
}

export interface CosMissionDirector {
  decide(input: {
    mission: CosMission
    manifest: PortableManifest
    observation: PortableObservation
    recentDecisions: readonly CosMissionDecision[]
  }): Promise<CosMissionDecision>
}

function extractObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return JSON.parse(fence[1])
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error('cos_mission_director_returned_no_json')
}

function validateDecision(raw: Record<string, unknown>, observation: PortableObservation): CosMissionDecision {
  const evidenceIds = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.map(String) : []
  const availableEvidence = new Set(observation.evidenceIds)
  for (const evidenceId of evidenceIds) {
    if (!availableEvidence.has(evidenceId)) throw new Error(`cos_mission_director_invented_evidence:${evidenceId}`)
  }
  const confidence = Number(raw.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('cos_mission_director_invalid_confidence')
  const priority = String(raw.priority || 'medium')
  if (!['low','medium','high','critical'].includes(priority)) throw new Error('cos_mission_director_invalid_priority')
  const shouldAct = raw.shouldAct === true
  const objective = String(raw.objective || '').trim()
  if (shouldAct && !objective) throw new Error('cos_mission_director_missing_objective')
  return {
    decisionId: String(raw.decisionId || `mission-decision-${Date.now()}`),
    objective,
    priority: priority as CosMissionDecision['priority'],
    rationale: String(raw.rationale || ''),
    evidenceIds,
    shouldAct,
    confidence,
  }
}

export function createModelMissionDirector(input?: {
  modelPreference?: 'claude' | 'openai' | 'local'
  maxTokens?: number
}): CosMissionDirector {
  return {
    async decide({ mission, manifest, observation, recentDecisions }) {
      const systemPrompt = [
        'You are COS Mission Director. You are the leader of the portable, not a passive assistant.',
        'Own the mission: inspect evidence, determine whether action is needed, choose the highest-value next objective, and delegate execution to lower layers.',
        'Do not wait for a human to invent the next task when the mission and evidence already determine it.',
        'Do not invent evidence, capabilities, resources, or authority.',
        'You never approve actions. Governance is enforced by deterministic code after your decision.',
        'Prefer prevention and early intervention over waiting for failure, but do not create work merely to appear active.',
        'Return JSON only: decisionId, objective, priority, rationale, evidenceIds, shouldAct, confidence.',
      ].join(' ')
      const prompt = JSON.stringify({
        mission,
        portable: {
          portableId: manifest.portableId,
          portableVersion: manifest.portableVersion,
          capabilities: manifest.capabilities,
        },
        observation,
        recentDecisions: recentDecisions.slice(-10),
      })
      const text = await callModel({ modelPreference: input?.modelPreference, systemPrompt, prompt, maxTokens: input?.maxTokens ?? 1800 })
      if (!text) throw new Error('cos_mission_director_model_unavailable')
      return validateDecision(extractObject(text), observation)
    },
  }
}
