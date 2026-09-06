import { builderEvidenceEvents } from './evidence-events.ts'

export type EvidenceJob = {
  id: string
  userId: string
  conversationId: string
  workspaceId: string
  objective?: string
  status: string
  metadata: Record<string, unknown>
  result: Record<string, unknown> | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A question about an existing artifact grants read authority only, never execution. */
export function isBuilderProjectQuestion(prompt: string): boolean {
  const request = prompt.replace(/"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g, ' ')
  if (/(?:^|[.!?;,\n]|\b(?:and|then)\b)\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:create|write|build|make|edit|update|fix|repair|debug|run|rerun|execute|test|add|remove|deploy|publish)\b/i.test(request)) return false
  return /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:explain|describe|how|why|what|where|which|does|is|are|can\s+i|should\s+i)\b/i.test(request)
    && (/\b(?:this|that|the|our|my|existing)\s+(?:app|application|project|code|cli|script|implementation|feature|function)\b/i.test(prompt)
      || /\b[\w/-]+\.(?:[cm]?js|tsx?|jsx|py|json|html|css|go|rs)\b/i.test(prompt)
      || /^\s*what(?:'s| is| should i do)\s+next\s*[?.!]*\s*$/i.test(prompt))
}

export function isBuilderExplanationRequest(prompt: string): boolean {
  return /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:explain|why|what\s+(?:changed|caused)|how\s+(?:did|was))\b/i.test(prompt)
    && (/\b(?:this|that|the|last|previous|earlier|saved|recorded)\s+(?:builder\s+)?(?:job|run|repair|fix|results?|failure)\b/i.test(prompt)
      || /\bjob\s+[0-9a-f-]{36}\b/i.test(prompt)
      || /\b[\w/-]+\.(?:[cm]?js|tsx?|jsx|py|json|html|css|go|rs)\b[^.!?\n]{0,100}\b(?:failed|changed|fixed|repaired)\b/i.test(prompt))
}

export function isBuilderEvidenceRequest(prompt: string): boolean {
  // Classify the requested action, not words inside the file's output or a quoted
  // former objective. A create/run request may also demand execution evidence.
  const request = prompt.replace(/"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g, ' ')
  const newWork = /(?:^|[.!?;,\n]|\b(?:and|then)\b)\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:create|write|build|make|edit|update|fix|repair|debug|run|rerun|execute|test)\b/i
  if (newWork.test(request)) return false
  if (isBuilderExplanationRequest(request)) return true
  return /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:show|provide|display|retrieve|what|give)\b/i.test(request)
    && /\b(?:recorded|execution|exit\s*code|stdout|stderr|command|evidence)\b/i.test(request)
    && /\b(?:builder|job|recorded execution|that run|previous run)\b/i.test(request)
}

function block(value: unknown): string {
  if (typeof value !== 'string') return '(not recorded)'
  if (!value) return '(empty)'
  const text = value.slice(0, 16_000)
  const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)))
  return `${fence}text\n${text}\n${fence}${value.length > text.length ? '\n(display truncated)' : ''}`
}

/** Render stored tool fields verbatim. Never infer a command, stream, or exit status. */
export function formatBuilderExecutionEvidence(trace: unknown): string {
  const runs = Array.isArray(trace) ? trace.filter(item => item && item.toolId === 'run') : []
  if (!runs.length) return 'No execution evidence was recorded for this job.'
  const events = builderEvidenceEvents(runs)
  return 'Recorded execution evidence:\n\n' + runs.slice(-5).map((run, index) =>
    `Run ${index + 1}\nOutcome: ${events.slice(-5)[index].outcome.replace(/_/g, ' ')}\n${typeof run.error === 'string' ? 'Recorded tool error:\n' + block(run.error) + '\n' : ''}Command:\n${block(run.command)}\nExit code: ${typeof run.exitCode === 'number' ? run.exitCode : '(not recorded)'}\nstdout:\n${block(run.stdout)}\nstderr:\n${block(run.stderr)}`,
  ).join('\n\n') + (runs.length > 5 ? '\nShowing the last five recorded runs.' : '')
}

export type EvidenceLookup = { userId: string; conversationId: string; workspaceId?: string; jobId?: string }

/** Read-only, same-user/same-conversation lookup; supplied links are selectors, never authority. */
export async function builderEvidenceReply(input: {
  prompt: string
  userId: string | null
  conversationId: string | null
  priorAnswer: string
  allowRepositoryEvidence: boolean
  hasNewSource?: boolean
}, lookup: (target: EvidenceLookup) => Promise<EvidenceJob | null>, explain?: (job: EvidenceJob) => Promise<string>): Promise<string | null> {
  const explicitEvidence = isBuilderEvidenceRequest(input.prompt)
  const projectQuestion = !explicitEvidence && !input.hasNewSource && isBuilderProjectQuestion(input.prompt)
  if (!explicitEvidence && !projectQuestion) return null
  const unavailable = 'I could not find recorded execution evidence for that Builder job in this conversation. No code was rerun.'
  if (!input.userId || !UUID.test(input.userId) || !input.conversationId || !UUID.test(input.conversationId)) return projectQuestion ? null : unavailable
  const jobId = input.prompt.match(/\bjob\s+([0-9a-f-]{36})\b/i)?.[1]
  const workspaceId = input.priorAnswer.match(/\/api\/builder\/workspaces\/([0-9a-f-]{36})\/files\//i)?.[1]
  const priorJobId = input.priorAnswer.match(/Builder job ([0-9a-f-]{36}) — /i)?.[1]
  if (projectQuestion && /^\s*what(?:'s| is| should i do)\s+next\s*[?.!]*\s*$/i.test(input.prompt) && !workspaceId && !priorJobId) return null
  try {
    const job = await lookup({ userId: input.userId, conversationId: input.conversationId,
      ...(jobId && UUID.test(jobId) ? { jobId } : {}),
      ...(!jobId && workspaceId && UUID.test(workspaceId) ? { workspaceId } : {}),
    })
    if (!job || job.userId !== input.userId || job.conversationId !== input.conversationId
      || (jobId && job.id !== jobId) || (!jobId && workspaceId && job.workspaceId !== workspaceId)
      || (projectQuestion && !workspaceId && priorJobId && job.id !== priorJobId)
      || (job.metadata.platformRepair === true && !input.allowRepositoryEvidence)) return projectQuestion ? null : unavailable
    if ((projectQuestion || isBuilderExplanationRequest(input.prompt)) && explain) return await explain(job)
    return `Builder job ${job.id} — ${job.status}.\n\n${formatBuilderExecutionEvidence(job.result?.trace)}\n\nRead from the saved job record; no code was rerun.`
  } catch { return unavailable }
}
