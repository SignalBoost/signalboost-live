// saas/lib/builder/job-poll.ts
//
// How the Builder page follows an accepted job to its result. Production 2026-10-13: one status check hit a network
// drop, the browser threw "Failed to fetch", the error escaped the wait loop and the page stopped following a job that
// was still running on the server. Polling is read-only, so a lost check is retried on the next one; only a definite
// answer from the server ends the wait.

import { BUILDER_JOB_TOTAL_DEADLINE_MS } from './work-budget.ts'

export type BuilderJobCheck<T> = Readonly<{ status: number; ok: boolean; data: T & { status?: string; error?: string } }>

export type BuilderJobFollowOutcome<T> =
  | Readonly<{ kind: 'terminal'; data: T }>
  | Readonly<{ kind: 'failed'; error: string }>
  | Readonly<{ kind: 'unreachable' }>
  | Readonly<{ kind: 'still_running' }>

// A paused job resumes on the server's continuation schedule, so the page keeps following it for the whole lifetime of a
// job: its total deadline plus time to save the final result. Production 2026-10-23: the window was 30 minutes while a
// job may run 60, so a long job's result never came back to the chat and the person was sent to History.
export const BUILDER_JOB_FOLLOW_WINDOW_MS = BUILDER_JOB_TOTAL_DEADLINE_MS + 2 * 60_000
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

export type BuilderRunSubmitOutcome<T> =
  | Readonly<{ kind: 'answered'; response: BuilderJobCheck<T> }>
  | Readonly<{ kind: 'accepted'; check: BuilderJobCheck<T> }>
  | Readonly<{ kind: 'unreachable' }>

// Production 2026-10-21: the Run request itself got no answer ("Failed to fetch") and the page stopped, without knowing
// whether the server had already queued the job. The page now names the job before sending it. When the request gets
// no answer, it asks the server about that job: a known job is followed; an unknown one is sent again under the same
// name, and the server refuses to create a second job with that name — so a lost answer never becomes a lost or
// doubled job.
export async function submitBuilderRun<T>(input: {
  post: () => Promise<BuilderJobCheck<T>>
  check: () => Promise<BuilderJobCheck<T>>
  sleep: (ms: number) => Promise<void>
  delayMs?: number
  maxUnansweredChecks?: number
}): Promise<BuilderRunSubmitOutcome<T>> {
  const maxUnanswered = input.maxUnansweredChecks ?? BUILDER_JOB_MAX_UNANSWERED_CHECKS
  let sendRequest = true
  for (let attempt = 0; attempt < maxUnanswered; attempt += 1) {
    if (attempt > 0) await input.sleep(input.delayMs ?? BUILDER_JOB_POLL_DELAY_MS)
    if (sendRequest) {
      try {
        return { kind: 'answered', response: await input.post() }
      } catch {
        // No answer: the job may or may not exist on the server. Ask before sending again.
        sendRequest = false
        continue
      }
    }
    let check: BuilderJobCheck<T>
    try {
      check = await input.check()
    } catch {
      continue
    }
    if (check.status >= 500 || check.status === 429) continue
    // The server has no job under this name: the request never arrived, so sending it again is safe.
    if (check.status === 404) {
      sendRequest = true
      continue
    }
    return { kind: 'accepted', check }
  }
  return { kind: 'unreachable' }
}
