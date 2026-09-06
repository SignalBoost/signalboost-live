import type { EvidenceJob, EvidenceLookup } from './execution-evidence.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTION = /^(?:(?:please|now|then|also)\s+|(?:can|could|would)\s+you\s+)*(?:update|edit|modify|extend|change|fix|repair|debug|refactor|add|remove|replace|continue|run|rerun|test)\b/i
const NEW_PROJECT = /\b(?:new|another|separate|different)\s+(?:project|workspace|app|application|website|repository)\b|\bstart\s+(?:over|fresh)\b/i
const REFERENCE = /\b(?:this|that|the|same|existing|previous|our|my)\s+(?:project|workspace|app|application|website|code|file|implementation)\b|\b(?:it|them)\b/i

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
  if (input.requestedWorkspaceId && UUID.test(input.requestedWorkspaceId)) return { workspaceId: input.requestedWorkspaceId }
  if (input.hasNewSource || input.repositoryImport || NEW_PROJECT.test(input.objective) || !ACTION.test(input.objective)) return {}
  if (!input.userId || !UUID.test(input.userId) || !input.conversationId || !UUID.test(input.conversationId)) return {}
  let job
  try { job = await lookup({ userId: input.userId, conversationId: input.conversationId }) }
  catch { return { blocked: 'unavailable' } }
  if (!job || job.userId !== input.userId || job.conversationId !== input.conversationId
    || !UUID.test(job.workspaceId) || job.metadata.platformRepair === true) return {}
  const paths = Array.isArray(job.result?.files) ? job.result.files.filter((path): path is string => typeof path === 'string') : []
  const namedExistingFile = paths.some(path => input.objective.includes(path))
  if (!namedExistingFile && !REFERENCE.test(input.objective) && !/^\s*(?:please\s+)?continue\b/i.test(input.objective)) return {}
  if (['queued', 'running', 'paused'].includes(job.status)) return { blocked: 'busy' }
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
