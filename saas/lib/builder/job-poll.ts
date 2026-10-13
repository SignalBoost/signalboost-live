// saas/lib/builder/job-poll.ts
//
// How the Builder page follows an accepted job to its result. Production 2026-10-13: one status check hit a network
// drop, the browser threw "Failed to fetch", the error escaped the wait loop and the page stopped following a job that
// was still running on the server. Polling is read-only, so a lost check is retried on the next one; only a definite
// answer from the server ends the wait.

export type BuilderJobCheck<T> = Readonly<{ status: number; ok: boolean; data: T & { status?: string; error?: string } }>

export type BuilderJobFollowOutcome<T> =
  | Readonly<{ kind: 'terminal'; data: T }>
  | Readonly<{ kind: 'failed'; error: string }>
  | Readonly<{ kind: 'unreachable' }>
  | Readonly<{ kind: 'still_running' }>

// A paused job resumes on the server's continuation schedule (every five minutes, at most four work slices), so the
// page keeps following it for the whole lifetime of a job rather than giving up after a few minutes.
export const BUILDER_JOB_FOLLOW_WINDOW_MS = 30 * 60_000
export const BUILDER_JOB_POLL_DELAY_MS = 2_000
// Consecutive checks that got no answer before the page says the connection is lost (about one minute).
export const BUILDER_JOB_MAX_UNANSWERED_CHECKS = 30

const ACTIVE = new Set(['queued', 'running', 'paused'])

export function isBuilderJobActive(check: BuilderJobCheck<unknown>): boolean {
  return check.status === 202 || ACTIVE.has(String(check.data?.status || ''))
}

export async function followBuilderJob<T>(input: {
  check: () => Promise<BuilderJobCheck<T>>
  onActive?: (data: T) => void
  sleep: (ms: number) => Promise<void>
  now?: () => number
  windowMs?: number
  delayMs?: number
  maxUnansweredChecks?: number
}): Promise<BuilderJobFollowOutcome<T>> {
  const now = input.now ?? Date.now
  const deadline = now() + (input.windowMs ?? BUILDER_JOB_FOLLOW_WINDOW_MS)
  const maxUnanswered = input.maxUnansweredChecks ?? BUILDER_JOB_MAX_UNANSWERED_CHECKS
  let unanswered = 0
  for (let attempt = 0; now() < deadline; attempt += 1) {
    if (attempt > 0) await input.sleep(input.delayMs ?? BUILDER_JOB_POLL_DELAY_MS)
    let check: BuilderJobCheck<T>
    try {
      check = await input.check()
    } catch {
      // A network drop answers nothing about the job: try again on the next check.
      if (++unanswered >= maxUnanswered) return { kind: 'unreachable' }
      continue
    }
    // A temporary server or gateway error is not the job's result either.
    if (check.status >= 500 || check.status === 429) {
      if (++unanswered >= maxUnanswered) return { kind: 'unreachable' }
      continue
    }
    unanswered = 0
    if (isBuilderJobActive(check)) {
      input.onActive?.(check.data)
      continue
    }
    if (!check.ok) return { kind: 'failed', error: check.data?.error || 'Builder job failed.' }
    return { kind: 'terminal', data: check.data }
  }
  return { kind: 'still_running' }
}
