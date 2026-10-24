import type { EvidenceJob, EvidenceLookup } from './execution-evidence.ts'
import { isNewApplicationSpecification } from './task-contract.ts'
import { openingDirective } from './regression-gate.ts'
import { isExplicitIsolatedProjectBuild } from './isolated-project-intent.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NEW_PROJECT = /\b(?:new|another|separate|different|fresh|clean)\s+(?:(?:isolated|fresh|clean|empty|independent)\s+)?(?:project|workspace|app|application|website|repository)\b|\bstart\s+(?:over|fresh)\b|\bfrom\s+scratch\b/i

/**
 * The opening instruction creates a whole thing ("Build a complete, working OrderFlow application", "Create a responsive
 * portfolio website"), not a part of the current one ("Implement order cancellation", "Create a settings page for our
 * app"): an indefinite article, then up to five describing words that are not a preposition or possessive, then a
 * whole-project noun.
 */
const CREATES_WHOLE_PROJECT = /\b(?:build|create|write|implement|generate|scaffold|produce|make|design|develop)\s+(?:a|an)\s+(?:(?!(?:for|to|in|into|of|on|inside|within|our|my|your|the|this|that|existing|current)\b)[\w-]+\s+){0,5}(?:app|application|website|web\s+app|site|project|service|game|tool|cli|api|system|program|platform|dashboard)\b/i

/**
 * A request for a new project: an explicit "new/fresh project" phrase, or a complete new-application specification
 * (opens with an instruction to create a whole application and lists the files to create). Production 2026-10-16,
 * job e98aa467: the OrderFlow specification pasted again in the same conversation inherited the previous job's
 * workspace and project context, so it ran on the legacy engine over stale files and ended
 * builder_regression_evidence_required although its final files pass all three required commands (28/28 tests).
 * Codex review on #4639/#4642: a feature with its own file list stays in its project, and a whole project needs no
 * particular package manifest (a static website has none).
 */
export function isNewBuilderProjectObjective(objective: string): boolean {
  // COS users often paste a task with an introductory Objective heading. Treat the ensuing
  // whole-application directive as a fresh project, not a continuation of the previous workspace.
  const normalized = objective.replace(/^\s*(?:#{1,6}\s*)?(?:objective|task|request)\s*:?\s*(?:\r?\n\s*)?/i, '').trimStart()
  return isExplicitIsolatedProjectBuild(normalized) || NEW_PROJECT.test(normalized) || (isNewApplicationSpecification(normalized)
    && CREATES_WHOLE_PROJECT.test(openingDirective(normalized).replace(/[*_`,]/g, ' ').replace(/\s+/g, ' ')))
}

export type BuilderProjectContext = {
  previousJobId: string
  previousObjective: string
  previousStatus: string
  previousCommands: string[]
}
export type BuilderProjectSelection = {
  workspaceId?: string
  context?: BuilderProjectContext
  blocked?: 'busy' | 'unavailable'
  activeJobId?: string
  activeStatus?: string
}

/** Only persisted same-user/conversation jobs select an implicit project; chat text grants no access. */
export async function selectBuilderProject(input: {
  objective: string
  userId: string | null
  conversationId: string | null
  requestedWorkspaceId?: string
  hasNewSource: boolean
  repositoryImport: boolean
}, lookup: (target: EvidenceLookup) => Promise<EvidenceJob & { objective?: string } | null>): Promise<BuilderProjectSelection> {
  // Explicit fresh builds and source imports must not borrow another project's history.
  if (isNewBuilderProjectObjective(input.objective)) return {}
  const selected = input.requestedWorkspaceId && UUID.test(input.requestedWorkspaceId)
    ? input.requestedWorkspaceId : undefined
  if (input.hasNewSource || input.repositoryImport) return selected ? { workspaceId: selected } : {}
  if (!input.userId || !UUID.test(input.userId) || !input.conversationId || !UUID.test(input.conversationId)) {
    return selected ? { workspaceId: selected } : {}
  }
  // The conversation is the durable project reference. Do not require a narrow
  // verb or pronoun in every follow-up before looking up the actual stored job.
  let job
  try {
    job = await lookup({ userId: input.userId, conversationId: input.conversationId,
      ...(selected ? { workspaceId: selected } : {}) })
  } catch { return { blocked: 'unavailable' } }
  if (!job || job.userId !== input.userId || job.conversationId !== input.conversationId
    || !UUID.test(job.workspaceId) || job.metadata.platformRepair === true) {
    return selected ? { workspaceId: selected } : {}
  }
  if (['queued', 'running', 'paused'].includes(job.status)) {
    return { workspaceId: job.workspaceId, blocked: 'busy', activeJobId: job.id, activeStatus: job.status }
  }
  const trace = Array.isArray(job.result?.trace) ? job.result.trace : []
  return { workspaceId: job.workspaceId, context: {
    previousJobId: job.id,
    previousObjective: String(job.objective || '').slice(0, 4000),
    previousStatus: job.status,
    previousCommands: [...new Set<string>(trace.filter(item => item?.toolId === 'run' && typeof item.command === 'string')
      .map(item => item.command.slice(0, 2000)))].slice(-5),
  } }
}

export function builderProjectBlockedReply(reason: 'busy' | 'unavailable'): string {
  return reason === 'busy'
    ? 'Builder is still working on this project. Let that job finish before changing the same files.'
    : 'I could not retrieve this conversation’s Builder project. Your existing files were not changed. Try the request again.'
}

