import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-local host selection for non-credit University practice. The selection is scoped to the
 * current practice batch and never mutates process.env, so concurrent cron/agent work cannot leak a
 * buyer-controlled model choice into unrelated inference or graded academic lanes.
 */
const practiceModelContext = new AsyncLocalStorage<{ model: string | null }>()

export function currentUniversityPracticeModelOverride(): string | null | undefined {
  return practiceModelContext.getStore()?.model
}

export function runWithUniversityPracticeModel<T>(
  model: string | null,
  work: () => Promise<T>,
): Promise<T> {
  return practiceModelContext.run({ model }, work)
}
