export interface CosRecipeConfidenceRecord {
  successes: number
  failures: number
  consecutiveFailures: number
  lastQuality: number
  promoted: boolean
  cooldownUntil?: number
  updatedAt: number
}

export interface CosRecipeConfidenceStore {
  get(key: string): CosRecipeConfidenceRecord | undefined | Promise<CosRecipeConfidenceRecord | undefined>
  set(key: string, record: CosRecipeConfidenceRecord): void | Promise<void>
}

export interface RecipeConfidencePolicy {
  promoteAfterSuccesses?: number
  cooldownAfterFailures?: number
  cooldownMs?: number
  now?: () => number
}

export const DEFAULT_RECIPE_CONFIDENCE_POLICY = Object.freeze({
  promoteAfterSuccesses: 3,
  cooldownAfterFailures: 2,
  cooldownMs: 15 * 60 * 1000,
})

export function createInMemoryRecipeConfidenceStore(): CosRecipeConfidenceStore {
  const records = new Map<string, CosRecipeConfidenceRecord>()
  return Object.freeze({ get: key => records.get(key), set: (key, record) => { records.set(key, Object.freeze({ ...record })) } })
}

export function isRecipeCoolingDown(record: CosRecipeConfidenceRecord | undefined, now = Date.now()): boolean {
  return Boolean(record?.cooldownUntil && record.cooldownUntil > now)
}

export function updateRecipeConfidence(
  previous: CosRecipeConfidenceRecord | undefined,
  quality: number,
  sufficient: boolean,
  policy: RecipeConfidencePolicy = {},
): CosRecipeConfidenceRecord {
  const now = policy.now ?? Date.now
  const promoteAfter = Math.max(1, policy.promoteAfterSuccesses ?? DEFAULT_RECIPE_CONFIDENCE_POLICY.promoteAfterSuccesses)
  const cooldownAfter = Math.max(1, policy.cooldownAfterFailures ?? DEFAULT_RECIPE_CONFIDENCE_POLICY.cooldownAfterFailures)
  const cooldownMs = Math.max(0, policy.cooldownMs ?? DEFAULT_RECIPE_CONFIDENCE_POLICY.cooldownMs)
  const success = sufficient && quality > 0
  const successes = (previous?.successes ?? 0) + (success ? 1 : 0)
  const failures = (previous?.failures ?? 0) + (success ? 0 : 1)
  const consecutiveFailures = success ? 0 : (previous?.consecutiveFailures ?? 0) + 1
  const promoted = success && (previous?.promoted || successes >= promoteAfter)
  const cooldownUntil = !success && consecutiveFailures >= cooldownAfter && cooldownMs > 0 ? now() + cooldownMs : undefined
  return Object.freeze({ successes, failures, consecutiveFailures, lastQuality: quality, promoted, cooldownUntil, updatedAt: now() })
}
