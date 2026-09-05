export type EvidenceJob = {
  id: string
  userId: string
  conversationId: string
  workspaceId: string
  status: string
  metadata: Record<string, unknown>
  result: Record<string, unknown> | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isBuilderEvidenceRequest(prompt: string): boolean {
  return /\b(?:show|provide|display|retrieve|what|give)\b/i.test(prompt)
    && /\b(?:recorded|execution|exit\s*code|stdout|stderr|command|evidence)\b/i.test(prompt)
    && /\b(?:builder|job|recorded execution|that run|previous run)\b/i.test(prompt)
    && !/\b(?:create|build|fix|repair)\s+(?:a\s+|the\s+)?(?:file|app|website|project)\b/i.test(prompt)
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
  return 'Recorded execution evidence:\n\n' + runs.slice(-5).map((run, index) =>
    `Run ${index + 1}\nCommand:\n${block(run.command)}\nExit code: ${typeof run.exitCode === 'number' ? run.exitCode : '(not recorded)'}\nstdout:\n${block(run.stdout)}\nstderr:\n${block(run.stderr)}`,
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
}, lookup: (target: EvidenceLookup) => Promise<EvidenceJob | null>): Promise<string | null> {
  if (!isBuilderEvidenceRequest(input.prompt)) return null
  const unavailable = 'I could not find recorded execution evidence for that Builder job in this conversation. No code was rerun.'
  if (!input.userId || !UUID.test(input.userId) || !input.conversationId || !UUID.test(input.conversationId)) return unavailable
  const jobId = input.prompt.match(/\bjob\s+([0-9a-f-]{36})\b/i)?.[1]
  const workspaceId = input.priorAnswer.match(/\/api\/builder\/workspaces\/([0-9a-f-]{36})\/files\//i)?.[1]
  try {
    const job = await lookup({ userId: input.userId, conversationId: input.conversationId,
      ...(jobId && UUID.test(jobId) ? { jobId } : {}),
      ...(!jobId && workspaceId && UUID.test(workspaceId) ? { workspaceId } : {}),
    })
    if (!job || job.userId !== input.userId || job.conversationId !== input.conversationId
      || (jobId && job.id !== jobId) || (!jobId && workspaceId && job.workspaceId !== workspaceId)
      || (job.metadata.platformRepair === true && !input.allowRepositoryEvidence)) return unavailable
    return `Builder job ${job.id} — ${job.status}.\n\n${formatBuilderExecutionEvidence(job.result?.trace)}\n\nRead from the saved job record; no code was rerun.`
  } catch { return unavailable }
}
