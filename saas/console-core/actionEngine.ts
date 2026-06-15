// saas/console-core/actionEngine.ts
//
// The portable pipeline: validate input against an ActionSchema → check
// permission via the AuthAdapter → run the resolved ActionExecutor → log via the
// LogAdapter. It imports ONLY the portable contracts — no app internals — so the
// exact same engine runs in any host.
//
// The existing /api/hub/action route is untouched. Providers are migrated to run
// through this engine one at a time (Phase 3); until then both coexist.

import type { ActionSchema, AuthAdapter, LogAdapter } from './types'

/** A provider action wired for the engine: its schema, policy id, and runtime. */
export interface RegisteredExecutor {
  providerId: string
  actionId: string
  /** Policy id used for the permission check (maps to action-policy). */
  policyActionId?: string
  schema: ActionSchema
  run: (
    ctx: { user: { id: string; email?: string; roles?: string[] } | null; providerId: string; actionId: string },
    input: Record<string, unknown>,
  ) => Promise<{ ok: boolean; message?: string; data?: unknown; error?: string }>
}

/** What the engine needs from the host. Satisfied by createDefaultHost(). */
export interface EngineHost {
  auth: AuthAdapter
  log: LogAdapter
  resolveExecutor(providerId: string, actionId: string): RegisteredExecutor | null
}

export interface EngineResult {
  ok: boolean
  status: number
  message?: string
  data?: unknown
  error?: string
}

/** Validate a flat input object against an ActionSchema's fields. */
export function validateInput(
  schema: ActionSchema,
  input: Record<string, unknown>,
): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  for (const f of schema.fields || []) {
    const v = input[f.id]
    const empty = v === undefined || v === null || v === ''
    if (f.required && empty) {
      errors.push(`${f.label || f.id} is required`)
      continue
    }
    if (empty) continue
    if (f.type === 'number' && typeof v !== 'number' && isNaN(Number(v))) {
      errors.push(`${f.label || f.id} must be a number`)
    }
    if (f.type === 'select' && Array.isArray(f.options) && f.options.length) {
      if (!f.options.some(o => o.value === String(v))) {
        errors.push(`${f.label || f.id} must be one of the allowed options`)
      }
    }
    if (f.type === 'json' && typeof v === 'string') {
      try { JSON.parse(v) } catch { errors.push(`${f.label || f.id} must be valid JSON`) }
    }
  }
  return { ok: errors.length === 0, errors }
}

/** Run one action through the full pipeline. Logging never fails the action. */
export async function runAction(
  host: EngineHost,
  req: { providerId: string; actionId: string; input: Record<string, unknown> },
): Promise<EngineResult> {
  const { providerId, actionId, input } = req

  const entry = host.resolveExecutor(providerId, actionId)
  if (!entry) {
    return { ok: false, status: 404, error: `No executor registered for ${providerId}.${actionId}` }
  }

  // 1. Validate
  const v = validateInput(entry.schema, input)
  if (!v.ok) return { ok: false, status: 400, error: v.errors.join('; ') }

  // 2. Identity + permission
  const user = await host.auth.getCurrentUser()
  const permitId = entry.policyActionId || actionId
  const allowed = await host.auth.hasPermission(user, providerId, permitId)
  if (!allowed) {
    await safeLog(host, user, providerId, actionId, 'error', input, 'permission denied')
    return { ok: false, status: 403, error: 'This action requires additional permission' }
  }

  // 3. Execute
  let result: { ok: boolean; message?: string; data?: unknown; error?: string }
  try {
    result = await entry.run({ user, providerId, actionId }, input)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Executor error'
    await safeLog(host, user, providerId, actionId, 'error', input, msg)
    return { ok: false, status: 500, error: msg }
  }

  // 4. Log (non-fatal)
  await safeLog(host, user, providerId, actionId, result.ok ? 'success' : 'error', input, result.error)

  return { ...result, status: result.ok ? 200 : 400 }
}

async function safeLog(
  host: EngineHost,
  user: { id: string } | null,
  providerId: string,
  actionId: string,
  status: 'success' | 'error',
  input: Record<string, unknown>,
  errorMessage?: string,
) {
  try {
    await host.log.logAction({
      timestamp: new Date().toISOString(),
      userId: user?.id,
      providerId,
      actionId,
      status,
      inputSummary: Object.keys(input || {}),  // keys only — never raw values
      errorMessage,
    })
  } catch {
    // logging must never fail the action
  }
}
